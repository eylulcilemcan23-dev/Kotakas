using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Kotakas.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class TraderRealtimeEndpoints
{
    public static IEndpointRouteBuilder MapTraderRealtimeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/presence/heartbeat", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == uid);
            if (user is null || user.AccountStatus != "active") return Results.Unauthorized();
            var now = DateTimeOffset.UtcNow;
            if (!user.LastSeenAt.HasValue || user.LastSeenAt.Value < now.AddSeconds(-30))
            {
                user.LastSeenAt = now;
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { ok = true, lastSeenAt = user.LastSeenAt, online = true });
        }).RequireAuthorization();

        app.MapGet("/api/trader/presence", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid);
            if (user is null) return Results.NotFound();
            var isTrader = user.VerifiedTrader || principal.IsInRole("trader") || ApiHelpers.IsAnyAdmin(principal);
            if (!isTrader) return Results.Forbid();
            var online = user.LastSeenAt.HasValue && user.LastSeenAt.Value >= DateTimeOffset.UtcNow.AddSeconds(-150);
            return Results.Ok(new
            {
                user.TraderAcceptingOffers,
                user.LastSeenAt,
                online,
                user.VerifiedTrader
            });
        }).RequireAuthorization();

        app.MapPut("/api/trader/presence", async (TraderPresenceInput input, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == uid);
            if (user is null) return Results.NotFound();
            var isTrader = user.VerifiedTrader || principal.IsInRole("trader") || ApiHelpers.IsAnyAdmin(principal);
            if (!isTrader) return Results.Forbid();
            user.TraderAcceptingOffers = input.AcceptingOffers;
            user.LastSeenAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                ok = true,
                user.TraderAcceptingOffers,
                user.LastSeenAt,
                online = true
            });
        }).RequireAuthorization();

        app.MapGet("/api/traders/featured", async (int? limit, AppDbContext db) =>
        {
            var take = Math.Clamp(limit ?? 8, 1, 24);
            var traders = await db.Users.AsNoTracking()
                .Where(x => x.AccountStatus == "active" && x.VerifiedTrader)
                .ToListAsync();
            if (traders.Count == 0) return Results.Ok(new { traders = Array.Empty<object>() });

            var ids = traders.Select(x => x.Id).ToList();
            var reviews = await db.TraderReviews.AsNoTracking().Where(x => ids.Contains(x.TraderUserId)).ToListAsync();
            var deals = await db.Deals.AsNoTracking().Where(x => ids.Contains(x.TraderUserId)).ToListAsync();
            var offers = await db.Offers.AsNoTracking().Include(x => x.SaleRequest).Where(x => ids.Contains(x.TraderUserId)).ToListAsync();
            var listings = await db.Listings.AsNoTracking().Where(x => ids.Contains(x.SellerUserId)).ToListAsync();
            var favorites = await db.Favorites.AsNoTracking().Where(x => x.TargetType == "trader" && ids.Contains(x.TargetId)).ToListAsync();
            var now = DateTimeOffset.UtcNow;

            var ranked = traders
                .Select(t => new { trader = t, metrics = TraderScoring.Calculate(t, reviews, deals, offers, listings, favorites, now) })
                .OrderByDescending(x => x.metrics.Score)
                .ThenByDescending(x => x.metrics.Online)
                .ThenByDescending(x => x.metrics.CompletedDeals)
                .Take(take)
                .Select((x, index) => new
                {
                    rank = index + 1,
                    id = x.trader.Id,
                    x.trader.DisplayName,
                    x.trader.UserVerified,
                    score = x.metrics.Score,
                    rating = x.metrics.Rating,
                    weightedRating = x.metrics.WeightedRating,
                    reviewCount = x.metrics.ReviewCount,
                    completedDeals = x.metrics.CompletedDeals,
                    refundedDeals = x.metrics.RefundedDeals,
                    successRate = x.metrics.SuccessRate,
                    averageResponseMinutes = x.metrics.AverageResponseMinutes,
                    responseSamples = x.metrics.ResponseSamples,
                    activeListings = x.metrics.ActiveListings,
                    followerCount = x.metrics.Followers,
                    online = x.metrics.Online,
                    acceptingOffers = x.metrics.AcceptingOffers,
                    lastSeenAt = x.metrics.LastSeenAt,
                    badges = x.metrics.Badges
                })
                .ToList();

            return Results.Ok(new
            {
                generatedAt = now,
                scoringVersion = "v1",
                traders = ranked
            });
        });

        return app;
    }
}

public record TraderPresenceInput(bool AcceptingOffers);
