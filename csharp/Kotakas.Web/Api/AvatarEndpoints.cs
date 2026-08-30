using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Kotakas.Web.Api;

public static class AvatarEndpoints
{
    private const long MaxAvatarBytes = 2 * 1024 * 1024;
    private static readonly string[] Extensions = ["jpg", "png", "webp"];

    public static IEndpointRouteBuilder MapAvatarEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/account/avatar").RequireAuthorization();

        group.MapGet("/", (ClaimsPrincipal p, IWebHostEnvironment env) =>
        {
            var uid = ApiHelpers.UserId(p);
            var url = FindAvatarUrl(env, uid);
            return Results.Ok(new { avatarUrl = url });
        });

        group.MapPost("/", async (ClaimsPrincipal p, HttpRequest request, IWebHostEnvironment env, CancellationToken cancellationToken) =>
        {
            if (!request.HasFormContentType)
                return Results.BadRequest(new { error = "avatar_form_required" });

            var form = await request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("file");
            if (file is null || file.Length <= 0)
                return Results.BadRequest(new { error = "avatar_file_required" });
            if (file.Length > MaxAvatarBytes)
                return Results.BadRequest(new { error = "avatar_too_large", maxBytes = MaxAvatarBytes });

            byte[] header = new byte[Math.Min(16, (int)file.Length)];
            await using (var read = file.OpenReadStream())
            {
                var got = await read.ReadAsync(header.AsMemory(0, header.Length), cancellationToken);
                if (got < header.Length) Array.Resize(ref header, got);
            }

            var ext = DetectExtension(header);
            if (ext is null)
                return Results.BadRequest(new { error = "unsupported_avatar_type" });

            var uid = ApiHelpers.UserId(p);
            var directory = AvatarDirectory(env);
            Directory.CreateDirectory(directory);
            DeleteExisting(directory, uid);

            var name = AvatarStem(uid) + "." + ext;
            var path = Path.Combine(directory, name);
            await using (var target = File.Create(path))
            await using (var source = file.OpenReadStream())
                await source.CopyToAsync(target, cancellationToken);

            return Results.Ok(new { ok = true, avatarUrl = $"/uploads/avatars/{name}?v={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}" });
        });

        group.MapDelete("/", (ClaimsPrincipal p, IWebHostEnvironment env) =>
        {
            DeleteExisting(AvatarDirectory(env), ApiHelpers.UserId(p));
            return Results.Ok(new { ok = true });
        });

        return app;
    }

    private static string AvatarDirectory(IWebHostEnvironment env) =>
        Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "uploads", "avatars");

    private static string AvatarStem(string userId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(userId));
        return "u_" + Convert.ToHexString(hash).ToLowerInvariant()[..32];
    }

    private static string? FindAvatarUrl(IWebHostEnvironment env, string userId)
    {
        var directory = AvatarDirectory(env);
        if (!Directory.Exists(directory)) return null;
        var stem = AvatarStem(userId);
        foreach (var ext in Extensions)
        {
            var path = Path.Combine(directory, stem + "." + ext);
            if (File.Exists(path))
                return $"/uploads/avatars/{stem}.{ext}?v={File.GetLastWriteTimeUtc(path).Ticks}";
        }
        return null;
    }

    private static void DeleteExisting(string directory, string userId)
    {
        if (!Directory.Exists(directory)) return;
        var stem = AvatarStem(userId);
        foreach (var ext in Extensions)
        {
            var path = Path.Combine(directory, stem + "." + ext);
            if (File.Exists(path)) File.Delete(path);
        }
    }

    private static string? DetectExtension(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return "jpg";
        if (h.Length >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47 && h[4] == 0x0D && h[5] == 0x0A && h[6] == 0x1A && h[7] == 0x0A) return "png";
        if (h.Length >= 12 && h[0] == (byte)'R' && h[1] == (byte)'I' && h[2] == (byte)'F' && h[3] == (byte)'F' && h[8] == (byte)'W' && h[9] == (byte)'E' && h[10] == (byte)'B' && h[11] == (byte)'P') return "webp";
        return null;
    }
}
