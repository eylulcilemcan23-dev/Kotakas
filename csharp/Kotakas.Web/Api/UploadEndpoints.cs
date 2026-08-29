using System.Security.Claims;
using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class UploadEndpoints
{
    private const long MaxImageBytes = 5 * 1024 * 1024;
    private static readonly string[] ImageExtensions = [".jpg", ".png", ".webp"];

    public static IEndpointRouteBuilder MapUploadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/sale-requests/{id:long}/image", async (long id, IWebHostEnvironment env, AppDbContext db) =>
        {
            if (!await db.SaleRequests.AsNoTracking().AnyAsync(x => x.Id == id)) return Results.NotFound();
            return Results.Ok(new { imageUrl = FindImageUrl(env, id) });
        });

        app.MapPost("/api/sale-requests/{id:long}/image", async (long id, ClaimsPrincipal principal, HttpRequest request, IWebHostEnvironment env, AppDbContext db) =>
        {
            var row = await db.SaleRequests.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.UserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            if (row.Status != "open") return Results.Conflict(new { error = "request_not_open" });
            if (!request.HasFormContentType) return Results.BadRequest(new { error = "multipart_required" });

            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length <= 0) return Results.BadRequest(new { error = "image_required" });
            if (file.Length > MaxImageBytes) return Results.BadRequest(new { error = "image_too_large", maxBytes = MaxImageBytes });

            var extension = await DetectSafeImageExtension(file);
            if (extension is null) return Results.BadRequest(new { error = "unsupported_image_type" });

            var directory = RequestImageDirectory(env);
            Directory.CreateDirectory(directory);
            DeleteExistingImages(env, id);
            var finalPath = Path.Combine(directory, $"{id}{extension}");
            var tempPath = Path.Combine(directory, $".{id}-{Guid.NewGuid():N}.tmp");
            try
            {
                await using (var output = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
                    await file.CopyToAsync(output);
                File.Move(tempPath, finalPath, true);
            }
            finally
            {
                if (File.Exists(tempPath)) File.Delete(tempPath);
            }

            return Results.Ok(new { ok = true, imageUrl = $"/uploads/requests/{id}{extension}" });
        }).RequireAuthorization();

        app.MapDelete("/api/sale-requests/{id:long}/image", async (long id, ClaimsPrincipal principal, IWebHostEnvironment env, AppDbContext db) =>
        {
            var row = await db.SaleRequests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.UserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            DeleteExistingImages(env, id);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        return app;
    }

    public static void DeleteExistingImages(IWebHostEnvironment env, long requestId)
    {
        var directory = RequestImageDirectory(env);
        foreach (var ext in ImageExtensions)
        {
            var path = Path.Combine(directory, $"{requestId}{ext}");
            if (File.Exists(path)) File.Delete(path);
        }
    }

    private static string? FindImageUrl(IWebHostEnvironment env, long requestId)
    {
        var directory = RequestImageDirectory(env);
        foreach (var ext in ImageExtensions)
            if (File.Exists(Path.Combine(directory, $"{requestId}{ext}"))) return $"/uploads/requests/{requestId}{ext}";
        return null;
    }

    private static string RequestImageDirectory(IWebHostEnvironment env) =>
        Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "uploads", "requests");

    private static async Task<string?> DetectSafeImageExtension(IFormFile file)
    {
        var header = new byte[12];
        await using var stream = file.OpenReadStream();
        var read = await stream.ReadAsync(header.AsMemory(0, header.Length));
        if (read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF) return ".jpg";
        if (read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47 && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A) return ".png";
        if (read >= 12 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46 && header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50) return ".webp";
        return null;
    }
}
