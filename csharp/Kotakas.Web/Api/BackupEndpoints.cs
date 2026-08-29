using Kotakas.Web.Services;

namespace Kotakas.Web.Api;

public static class BackupEndpoints
{
    public static IEndpointRouteBuilder MapBackupEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/backups", (HttpContext http, DatabaseBackupService backups) =>
        {
            if (!ApiHelpers.IsFullAdmin(http.User)) return Results.Forbid();
            return Results.Ok(new
            {
                provider = backups.Provider,
                inAppBackupSupported = backups.SupportsInAppBackup,
                managedBackupRequired = !backups.SupportsInAppBackup,
                backups = backups.ListBackups()
            });
        }).RequireAuthorization();

        app.MapPost("/api/admin/backups/create", async (HttpContext http, DatabaseBackupService backups) =>
        {
            if (!ApiHelpers.IsFullAdmin(http.User)) return Results.Forbid();
            try
            {
                var result = await backups.CreateBackupAsync(http.RequestAborted);
                return Results.Ok(new { ok = true, backup = result });
            }
            catch (NotSupportedException ex)
            {
                return Results.Json(new
                {
                    error = "managed_database_backup_required",
                    provider = backups.Provider,
                    message = ex.Message
                }, statusCode: 409);
            }
        }).RequireAuthorization();

        return app;
    }
}
