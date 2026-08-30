using System.Globalization;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class MarketRateAdminEndpoints
{
    public static IEndpointRouteBuilder MapMarketRateAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/market-rate")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        group.MapGet("/", async (AppDbContext db) =>
        {
            var settings = await db.SiteSettings.AsNoTracking()
                .Where(x => x.Key.StartsWith("gb_try_rate"))
                .ToDictionaryAsync(x => x.Key, x => x.Value);

            decimal Read(string key)
                => settings.TryGetValue(key, out var raw) && decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var value)
                    ? value : 0m;

            return Results.Ok(new
            {
                mode = settings.TryGetValue("gb_try_rate_mode", out var mode) && mode.Equals("manual", StringComparison.OrdinalIgnoreCase) ? "manual" : "auto",
                effectiveTryPerGb = Read("gb_try_rate"),
                feedTryPerGb = Read("gb_try_rate_feed"),
                sourceBuyTryPerGb = Read("gb_try_rate_source_buy"),
                sourceSellTryPerGb = Read("gb_try_rate_source_sell"),
                sourceName = settings.GetValueOrDefault("gb_try_rate_source_name") ?? "—",
                sourceUrl = settings.GetValueOrDefault("gb_try_rate_source") ?? "",
                updatedAt = settings.GetValueOrDefault("gb_try_rate_updated_at") ?? "",
                syncStatus = settings.GetValueOrDefault("gb_try_rate_sync_status") ?? "waiting"
            });
        });

        group.MapPut("/", async (MarketRateModeInput input, AppDbContext db) =>
        {
            var mode = (input.Mode ?? "").Trim().ToLowerInvariant();
            if (mode is not ("auto" or "manual")) return Results.BadRequest(new { error = "invalid_market_rate_mode" });

            if (mode == "manual" && (!input.ManualTryPerGb.HasValue || input.ManualTryPerGb <= 0 || input.ManualTryPerGb > 10_000_000m))
                return Results.BadRequest(new { error = "invalid_manual_market_rate" });

            await Upsert(db, "gb_try_rate_mode", mode);
            if (mode == "manual")
            {
                await Upsert(db, "gb_try_rate", input.ManualTryPerGb!.Value.ToString(CultureInfo.InvariantCulture));
            }
            else
            {
                var feed = await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == "gb_try_rate_feed");
                if (feed is not null && decimal.TryParse(feed.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var feedRate) && feedRate > 0)
                    await Upsert(db, "gb_try_rate", feedRate.ToString(CultureInfo.InvariantCulture));
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, mode });
        });

        return app;
    }

    private static async Task Upsert(AppDbContext db, string key, string value)
    {
        var row = await db.SiteSettings.FindAsync(key);
        if (row is null)
        {
            row = new SiteSetting { Key = key };
            db.SiteSettings.Add(row);
        }
        row.Value = value;
        row.UpdatedAt = DateTimeOffset.UtcNow;
    }
}

public record MarketRateModeInput(string? Mode, decimal? ManualTryPerGb);
