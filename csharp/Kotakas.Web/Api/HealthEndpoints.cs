using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", async (AppDbContext db) =>
        {
            var ok = await db.Database.CanConnectAsync();
            var provider = db.Database.IsNpgsql() ? "PostgreSQL" : db.Database.IsSqlite() ? "SQLite" : db.Database.ProviderName ?? "Unknown";
            var schemaVersion = ok
                ? await db.SiteSettings.AsNoTracking().Where(x => x.Key == "schema_version").Select(x => x.Value).FirstOrDefaultAsync()
                : null;
            var pendingMigrations = ok && db.Database.IsNpgsql()
                ? (await db.Database.GetPendingMigrationsAsync()).Count()
                : 0;
            return Results.Json(new
            {
                ok,
                app = "KOTAKAS C# V13",
                runtime = ".NET 8",
                database = provider,
                schemaVersion = schemaVersion ?? "legacy",
                migrations = db.Database.IsNpgsql() ? (pendingMigrations == 0 ? "current" : "pending") : "sqlite-compat",
                pendingMigrations
            }, statusCode: ok && pendingMigrations == 0 ? 200 : 503);
        });
        return app;
    }
}
