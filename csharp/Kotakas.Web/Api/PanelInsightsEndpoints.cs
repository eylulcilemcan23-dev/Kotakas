using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class PanelInsightsEndpoints
{
    public static IEndpointRouteBuilder MapPanelInsightsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/panel/user-insights", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var deals = await db.Deals.AsNoTracking()
                .Where(x => x.UserId == uid || x.TraderUserId == uid)
                .OrderByDescending(x => x.Id)
                .Take(1000)
                .ToListAsync();

            var completed = deals.Where(x => x.Status == "completed").ToList();
            var refunded = deals.Count(x => x.Status == "refunded");
            var disputed = deals.Count(x => x.Status == "disputed");
            var active = deals.Where(x => x.EscrowTry > 0 && x.Status is not ("completed" or "refunded" or "cancelled")).ToList();
            var reviewedDeals = await db.TraderReviews.AsNoTracking().CountAsync(x => x.ReviewerUserId == uid);
            var verified = await db.Users.AsNoTracking().Where(x => x.Id == uid).Select(x => x.UserVerified).FirstOrDefaultAsync();

            var level = UserLevel(completed.Count);
            var badges = new List<object>();
            if (completed.Count >= 1) badges.Add(new { code = "first_trade", icon = "🤝", title = "İlk İşlem", description = "İlk güvenli KOTAKAS işlemini tamamladı." });
            if (completed.Count >= 10) badges.Add(new { code = "ten_trades", icon = "🥉", title = "10 İşlem", description = "10 tamamlanan işleme ulaştı." });
            if (completed.Count >= 25) badges.Add(new { code = "twenty_five", icon = "🥈", title = "25 İşlem", description = "25 tamamlanan işleme ulaştı." });
            if (completed.Count >= 50) badges.Add(new { code = "fifty_trades", icon = "🥇", title = "50 İşlem", description = "50 tamamlanan işleme ulaştı." });
            if (completed.Count >= 100) badges.Add(new { code = "hundred_trades", icon = "💎", title = "100 İşlem", description = "100 tamamlanan işleme ulaştı." });
            if (verified) badges.Add(new { code = "verified", icon = "🛡️", title = "Doğrulanmış Hesap", description = "KOTAKAS hesap doğrulamasından geçti." });
            if (completed.Count >= 5 && refunded == 0 && disputed == 0) badges.Add(new { code = "clean_record", icon = "✅", title = "Temiz Geçmiş", description = "5+ tamamlanan işlemde iade veya açık anlaşmazlık yok." });
            if (reviewedDeals >= 5) badges.Add(new { code = "reviewer", icon = "⭐", title = "Aktif Değerlendirici", description = "En az 5 gerçek işlemi değerlendirdi." });

            return Results.Ok(new
            {
                completedDeals = completed.Count,
                refundedDeals = refunded,
                disputedDeals = disputed,
                activeDeals = active.Count,
                activeEscrowTry = active.Sum(x => x.EscrowTry),
                completedVolumeTry = completed.Sum(x => x.GrossTry),
                reviewsGiven = reviewedDeals,
                verified,
                level,
                badges,
                recentCompleted = completed.Take(5).Select(x => new { x.Id, x.ItemName, x.ServerCode, x.GrossTry, x.CompletedAt })
            });
        }).RequireAuthorization();

        app.MapGet("/api/panel/trader-insights", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("trader") && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            var uid = ApiHelpers.UserId(principal);
            var now = DateTimeOffset.UtcNow;
            var since30 = now.AddDays(-30);
            var since14 = new DateTimeOffset(now.UtcDateTime.Date.AddDays(-13), TimeSpan.Zero);

            var deals = await db.Deals.AsNoTracking()
                .Where(x => x.TraderUserId == uid)
                .OrderByDescending(x => x.Id)
                .Take(3000)
                .ToListAsync();
            var listings = await db.Listings.AsNoTracking().Where(x => x.SellerUserId == uid).ToListAsync();
            var priceOffers = await db.Set<ListingPriceOffer>().AsNoTracking()
                .Include(x => x.Listing)
                .Where(x => x.Listing != null && x.Listing.SellerUserId == uid)
                .OrderByDescending(x => x.Id)
                .Take(1000)
                .ToListAsync();

            var completed = deals.Where(x => x.Status == "completed").ToList();
            object Window(int days)
            {
                var start = now.AddDays(-days);
                var rows = completed.Where(x => (x.CompletedAt ?? x.CreatedAt) >= start).ToList();
                return new
                {
                    days,
                    deals = rows.Count,
                    volumeTry = rows.Sum(x => x.GrossTry),
                    netTry = rows.Sum(x => x.SellerNetTry),
                    commissionTry = rows.Sum(x => x.CommissionTry),
                    averageTicketTry = rows.Count == 0 ? 0m : Math.Round(rows.Average(x => x.GrossTry), 2)
                };
            }

            var daily = Enumerable.Range(0, 14).Select(i =>
            {
                var day = since14.AddDays(i);
                var next = day.AddDays(1);
                var rows = completed.Where(x => (x.CompletedAt ?? x.CreatedAt) >= day && (x.CompletedAt ?? x.CreatedAt) < next).ToList();
                return new { date = day.ToString("yyyy-MM-dd"), deals = rows.Count, netTry = rows.Sum(x => x.SellerNetTry), volumeTry = rows.Sum(x => x.GrossTry) };
            }).ToList();

            var topItems = completed.Where(x => (x.CompletedAt ?? x.CreatedAt) >= since30)
                .GroupBy(x => x.ItemName)
                .Select(g => new { itemName = g.Key, deals = g.Count(), volumeTry = g.Sum(x => x.GrossTry), netTry = g.Sum(x => x.SellerNetTry) })
                .OrderByDescending(x => x.deals).ThenByDescending(x => x.volumeTry).Take(5).ToList();

            var recentPriceOffers = priceOffers.Where(x => x.CreatedAt >= since30).ToList();
            var answered = recentPriceOffers.Count(x => x.Status is not "pending");
            return Results.Ok(new
            {
                today = Window(1),
                last7 = Window(7),
                last30 = Window(30),
                allTime = new { deals = completed.Count, volumeTry = completed.Sum(x => x.GrossTry), netTry = completed.Sum(x => x.SellerNetTry) },
                listings = new
                {
                    active = listings.Count(x => x.Status == "active" && x.Stock > 0),
                    lowStock = listings.Count(x => x.Status == "active" && x.Stock > 0 && x.Stock <= 2),
                    soldOut = listings.Count(x => x.Status == "sold_out" || x.Stock <= 0),
                    totalStock = listings.Where(x => x.Status == "active").Sum(x => Math.Max(0, x.Stock))
                },
                priceOffers = new
                {
                    pending = priceOffers.Count(x => x.Status == "pending"),
                    accepted30 = recentPriceOffers.Count(x => x.Status is "accepted" or "purchased"),
                    declined30 = recentPriceOffers.Count(x => x.Status == "declined"),
                    responseRate30 = recentPriceOffers.Count == 0 ? (double?)null : Math.Round(answered * 100d / recentPriceOffers.Count, 1)
                },
                daily,
                topItems
            });
        }).RequireAuthorization();

        app.MapGet("/api/admin/performance", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var now = DateTimeOffset.UtcNow;
            var since30 = now.AddDays(-30);
            var since14 = new DateTimeOffset(now.UtcDateTime.Date.AddDays(-13), TimeSpan.Zero);
            var completed = await db.Deals.AsNoTracking().Where(x => x.Status == "completed").ToListAsync();
            var recent = completed.Where(x => (x.CompletedAt ?? x.CreatedAt) >= since30).ToList();

            // SQLite cannot translate some DateTimeOffset comparisons. Keep the DB projection small,
            // then perform the cutoff comparison in memory for provider-neutral behavior.
            var userDates = await db.Users.AsNoTracking().Select(x => x.CreatedAt).ToListAsync();
            var requestDates = await db.SaleRequests.AsNoTracking().Select(x => x.CreatedAt).ToListAsync();
            var listingDates = await db.Listings.AsNoTracking().Select(x => x.CreatedAt).ToListAsync();
            var newUsers30 = userDates.Count(x => x >= since30);
            var requests30 = requestDates.Count(x => x >= since30);
            var newListings30 = listingDates.Count(x => x >= since30);

            var daily = Enumerable.Range(0, 14).Select(i =>
            {
                var day = since14.AddDays(i); var next = day.AddDays(1);
                var rows = completed.Where(x => (x.CompletedAt ?? x.CreatedAt) >= day && (x.CompletedAt ?? x.CreatedAt) < next).ToList();
                return new { date = day.ToString("yyyy-MM-dd"), deals = rows.Count, volumeTry = rows.Sum(x => x.GrossTry), commissionTry = rows.Sum(x => x.CommissionTry) };
            }).ToList();

            var traderIds = recent.Select(x => x.TraderUserId).Distinct().ToList();
            var traderNames = await db.Users.AsNoTracking().Where(x => traderIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName);
            var topTraders = recent.GroupBy(x => x.TraderUserId)
                .Select(g => new { traderUserId = g.Key, displayName = traderNames.TryGetValue(g.Key, out var n) ? n : "Pazarcı", deals = g.Count(), volumeTry = g.Sum(x => x.GrossTry), commissionTry = g.Sum(x => x.CommissionTry) })
                .OrderByDescending(x => x.volumeTry).Take(5).ToList();
            var topServers = recent.GroupBy(x => x.ServerCode)
                .Select(g => new { serverCode = g.Key, deals = g.Count(), volumeTry = g.Sum(x => x.GrossTry) })
                .OrderByDescending(x => x.volumeTry).ToList();

            return Results.Ok(new
            {
                last30 = new
                {
                    deals = recent.Count,
                    volumeTry = recent.Sum(x => x.GrossTry),
                    commissionTry = recent.Sum(x => x.CommissionTry),
                    averageTicketTry = recent.Count == 0 ? 0m : Math.Round(recent.Average(x => x.GrossTry), 2),
                    newUsers = newUsers30,
                    saleRequests = requests30,
                    newListings = newListings30
                },
                allTime = new { deals = completed.Count, volumeTry = completed.Sum(x => x.GrossTry), commissionTry = completed.Sum(x => x.CommissionTry) },
                daily,
                topTraders,
                topServers
            });
        }).RequireAuthorization();

        return app;
    }

    private static object UserLevel(int completed)
    {
        var levels = new[]
        {
            (Name: "Çaylak", Icon: "🪶", Min: 0, Next: 3),
            (Name: "Bronz", Icon: "🥉", Min: 3, Next: 10),
            (Name: "Gümüş", Icon: "🥈", Min: 10, Next: 25),
            (Name: "Altın", Icon: "🥇", Min: 25, Next: 50),
            (Name: "Platin", Icon: "🏆", Min: 50, Next: 100),
            (Name: "Elmas", Icon: "💎", Min: 100, Next: int.MaxValue)
        };
        var current = levels.Last(x => completed >= x.Min);
        var nextAt = current.Next == int.MaxValue ? (int?)null : current.Next;
        var progress = nextAt is null ? 100d : Math.Clamp((completed - current.Min) * 100d / Math.Max(1, current.Next - current.Min), 0d, 100d);
        return new { name = current.Name, icon = current.Icon, completedDeals = completed, nextAt, progressPercent = Math.Round(progress, 1), remaining = nextAt is null ? 0 : Math.Max(0, nextAt.Value - completed) };
    }
}
