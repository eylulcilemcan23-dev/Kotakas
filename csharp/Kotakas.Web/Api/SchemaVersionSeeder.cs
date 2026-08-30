using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class SchemaVersionSeeder
{
    public const string Current = "13";

    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTimeOffset.UtcNow;
        var row = await db.SiteSettings.FirstOrDefaultAsync(x => x.Key == "schema_version");
        if (row is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = "schema_version", Value = Current, UpdatedAt = now });
        }
        else if (row.Value != Current)
        {
            row.Value = Current;
            row.UpdatedAt = now;
        }

        var defaults = new Dictionary<string, string>
        {
            ["risk_large_adjustment_try"] = "50000",
            ["risk_wallet_velocity_try"] = "100000",
            ["risk_disputes_24h"] = "3",
            ["risk_stale_escrow_hours"] = "72"
        };
        var existing = await db.SiteSettings.Where(x => defaults.Keys.Contains(x.Key)).Select(x => x.Key).ToListAsync();
        foreach (var pair in defaults.Where(x => !existing.Contains(x.Key)))
            db.SiteSettings.Add(new SiteSetting { Key = pair.Key, Value = pair.Value, UpdatedAt = now });

        await db.SaveChangesAsync();
    }
}
