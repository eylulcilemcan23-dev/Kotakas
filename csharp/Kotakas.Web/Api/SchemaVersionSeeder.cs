using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class SchemaVersionSeeder
{
    public const string Current = "12";

    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.SiteSettings.FirstOrDefaultAsync(x => x.Key == "schema_version");
        if (row is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = "schema_version", Value = Current, UpdatedAt = DateTimeOffset.UtcNow });
        }
        else if (row.Value != Current)
        {
            row.Value = Current;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync();
    }
}
