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
            return Results.Json(new { ok, app = "KOTAKAS C# V2", runtime = ".NET 8", database = "SQLite" }, statusCode: ok ? 200 : 503);
        });
        return app;
    }
}
