using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class PanelExpansionEndpoints
{
    public static IEndpointRouteBuilder MapPanelExpansionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/site/operations", async (AppDbContext db) =>
        {
            var keys = new[] { "announcement_enabled", "announcement_text", "announcement_type", "maintenance_enabled", "maintenance_message" };
            var settings = await db.SiteSettings.AsNoTracking().Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, x => x.Value);
            return Results.Ok(new
            {
                announcement = new
                {
                    enabled = Bool(settings, "announcement_enabled"),
                    text = Text(settings, "announcement_text"),
                    type = string.IsNullOrWhiteSpace(Text(settings, "announcement_type")) ? "info" : Text(settings, "announcement_type")
                },
                maintenance = new
                {
                    enabled = Bool(settings, "maintenance_enabled"),
                    message = string.IsNullOrWhiteSpace(Text(settings, "maintenance_message")) ? "KOTAKAS üzerinde planlı bakım yapılıyor. Finansal ve pazar işlemleri geçici olarak durduruldu." : Text(settings, "maintenance_message")
                }
            });
        });

        app.MapGet("/api/panel/user-insights", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var completed = await db.Deals.AsNoTracking()
                .Where(x => x.UserId == uid && x.Status == "completed")
                .OrderByDescending(x => x.CompletedAt ?? x.CreatedAt)
                .ToListAsync();
            var disputed = await db.Deals.AsNoTracking().CountAsync(x => x.UserId == uid && x.Status == "disputed");
            var reviews = await db.TraderReviews.AsNoTracking().CountAsync(x => x.ReviewerUserId == uid);
            var favorites = await db.Favorites.AsNoTracking().CountAsync(x => x.UserId == uid);
            var watches = await db.ItemWatches.AsNoTracking().CountAsync(x => x.UserId == uid);
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid);

            var count = completed.Count;
            var (level, title, nextTarget) = UserLevel(count);
            var badges = new List<string>();
            if (user?.UserVerified == true) badges.Add("🛡️ Doğrulanmış Hesap");
            if (count >= 1) badges.Add("🤝 İlk İşlem");
            if (count >= 10) badges.Add("⚡ Aktif Takasçı");
            if (count >= 50) badges.Add("🏅 Deneyimli Oyuncu");
            if (count >= 100) badges.Add("💎 KOTAKAS Ustası");
            if (reviews >= 5) badges.Add("⭐ Değerlendiren Üye");
            if (favorites >= 10) badges.Add("❤ Pazar Takipçisi");
            if (watches >= 5) badges.Add("🎯 Fiyat Avcısı");

            var currentFloor = level switch { 1 => 0, 2 => 5, 3 => 20, 4 => 50, 5 => 100, _ => 0 };
            var progress = nextTarget is null ? 100d : Math.Clamp((count - currentFloor) * 100d / Math.Max(1, nextTarget.Value - currentFloor), 0d, 100d);

            return Results.Ok(new
            {
                level,
                title,
                completedDeals = count,
                disputedDeals = disputed,
                reviewsGiven = reviews,
                favorites,
                itemWatches = watches,
                nextTarget,
                progressPercent = Math.Round(progress, 1),
                badges,
                recentCompleted = completed.Take(5).Select(x => new { x.Id, x.ItemName, x.ServerCode, x.PriceGb, x.GrossTry, x.CompletedAt, x.CreatedAt })
            });
        }).RequireAuthorization();

        app.MapGet("/api/panel/trader-insights", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("trader") && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            var uid = ApiHelpers.UserId(principal);
            var now = DateTimeOffset.UtcNow;
            var deals = await db.Deals.AsNoTracking().Where(x => x.TraderUserId == uid && x.Status == "completed").ToListAsync();
            var listings = await db.Listings.AsNoTracking().Where(x => x.SellerUserId == uid).ToListAsync();
            var priceOffers = await db.Set<ListingPriceOffer>().AsNoTracking().Where(x => x.Listing!.SellerUserId == uid).ToListAsync();

            object Period(int days)
            {
                var start = now.AddDays(-days);
                var rows = deals.Where(x => (x.CompletedAt ?? x.CreatedAt) >= start).ToList();
                return new
                {
                    days,
                    deals = rows.Count,
                    volumeTry = rows.Sum(x => x.GrossTry),
                    netTry = rows.Sum(x => x.SellerNetTry),
                    commissionTry = rows.Sum(x => x.CommissionTry),
                    volumeGb = rows.Sum(x => x.PriceGb)
                };
            }

            var active = listings.Where(x => x.Status == "active" && x.Stock > 0).ToList();
            var low = active.Where(x => x.Stock <= 2).ToList();
            return Results.Ok(new
            {
                today = Period(1),
                sevenDays = Period(7),
                thirtyDays = Period(30),
                allTime = new { deals = deals.Count, volumeTry = deals.Sum(x => x.GrossTry), netTry = deals.Sum(x => x.SellerNetTry) },
                listingHealth = new
                {
                    total = listings.Count,
                    active = active.Count,
                    lowStock = low.Count,
                    soldOut = listings.Count(x => x.Status == "sold_out" || x.Stock <= 0),
                    paused = listings.Count(x => x.Status == "paused"),
                    totalStock = active.Sum(x => x.Stock)
                },
                negotiations = new
                {
                    pending = priceOffers.Count(x => x.Status == "pending"),
                    accepted = priceOffers.Count(x => x.Status == "accepted"),
                    purchased = priceOffers.Count(x => x.Status == "purchased"),
                    declined = priceOffers.Count(x => x.Status == "declined")
                },
                topItems = deals.GroupBy(x => new { x.ItemName, x.ServerCode })
                    .Select(g => new { g.Key.ItemName, g.Key.ServerCode, deals = g.Count(), netTry = g.Sum(x => x.SellerNetTry) })
                    .OrderByDescending(x => x.deals).ThenByDescending(x => x.netTry).Take(5)
            });
        }).RequireAuthorization();

        var admin = app.MapGroup("/api/admin/platform")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        admin.MapGet("/insights", async (AppDbContext db) =>
        {
            var now = DateTimeOffset.UtcNow;
            var deals = await db.Deals.AsNoTracking().Where(x => x.Status == "completed").ToListAsync();
            var users = await db.Users.AsNoTracking().Select(x => new { x.CreatedAt }).ToListAsync();
            var requests = await db.SaleRequests.AsNoTracking().Select(x => new { x.CreatedAt }).ToListAsync();

            object Period(int days)
            {
                var start = now.AddDays(-days);
                var rows = deals.Where(x => (x.CompletedAt ?? x.CreatedAt) >= start).ToList();
                return new
                {
                    days,
                    deals = rows.Count,
                    volumeTry = rows.Sum(x => x.GrossTry),
                    commissionTry = rows.Sum(x => x.CommissionTry),
                    newUsers = users.Count(x => x.CreatedAt >= start),
                    newRequests = requests.Count(x => x.CreatedAt >= start)
                };
            }

            return Results.Ok(new
            {
                today = Period(1),
                sevenDays = Period(7),
                thirtyDays = Period(30),
                allTime = new { deals = deals.Count, volumeTry = deals.Sum(x => x.GrossTry), commissionTry = deals.Sum(x => x.CommissionTry) },
                openDisputes = await db.Deals.AsNoTracking().CountAsync(x => x.Status == "disputed"),
                openSupport = await db.SupportTickets.AsNoTracking().CountAsync(x => x.Status != "closed")
            });
        });

        admin.MapPut("/operations", async (SiteOperationsInput input, AppDbContext db) =>
        {
            var announcement = (input.AnnouncementText ?? "").Trim();
            var maintenance = (input.MaintenanceMessage ?? "").Trim();
            var type = (input.AnnouncementType ?? "info").Trim().ToLowerInvariant();
            if (announcement.Length > 300 || maintenance.Length > 500 || type is not ("info" or "success" or "warning" or "danger"))
                return Results.BadRequest(new { error = "invalid_site_operations" });

            var values = new Dictionary<string, string>
            {
                ["announcement_enabled"] = input.AnnouncementEnabled ? "true" : "false",
                ["announcement_text"] = announcement,
                ["announcement_type"] = type,
                ["maintenance_enabled"] = input.MaintenanceEnabled ? "true" : "false",
                ["maintenance_message"] = maintenance
            };
            foreach (var (key, value) in values)
            {
                var row = await db.SiteSettings.FindAsync(key);
                if (row is null) { row = new SiteSetting { Key = key }; db.SiteSettings.Add(row); }
                row.Value = value;
                row.UpdatedAt = DateTimeOffset.UtcNow;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        });

        return app;
    }

    private static string Text(Dictionary<string, string> values, string key) => values.TryGetValue(key, out var value) ? value ?? "" : "";
    private static bool Bool(Dictionary<string, string> values, string key) => bool.TryParse(Text(values, key), out var value) && value;

    private static (int Level, string Title, int? NextTarget) UserLevel(int completed) => completed switch
    {
        >= 100 => (5, "KOTAKAS Ustası", null),
        >= 50 => (4, "Deneyimli Oyuncu", 100),
        >= 20 => (3, "Aktif Takasçı", 50),
        >= 5 => (2, "Pazar Kaşifi", 20),
        _ => (1, "Yeni Üye", 5)
    };
}

public sealed record SiteOperationsInput(bool AnnouncementEnabled, string? AnnouncementText, string? AnnouncementType, bool MaintenanceEnabled, string? MaintenanceMessage);
