using Kotakas.Web.Data;
using Kotakas.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class TraderProfileEndpoints
{
    public static IEndpointRouteBuilder MapTraderProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trader-profiles/{id}", async (string id, AppDbContext db) =>
        {
            var trader = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.AccountStatus == "active" && x.VerifiedTrader);
            if (trader is null) return Results.NotFound();

            var reviews = await db.TraderReviews.AsNoTracking()
                .Where(x => x.TraderUserId == id)
                .OrderByDescending(x => x.Id)
                .Take(100)
                .ToListAsync();
            var reviewerIds = reviews.Select(x => x.ReviewerUserId).Distinct().ToList();
            var reviewerNames = await db.Users.AsNoTracking()
                .Where(x => reviewerIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

            var deals = await db.Deals.AsNoTracking().Where(x => x.TraderUserId == id).ToListAsync();
            var offers = await db.Offers.AsNoTracking().Include(x => x.SaleRequest).Where(x => x.TraderUserId == id).ToListAsync();
            var listings = await db.Listings.AsNoTracking()
                .Where(x => x.SellerUserId == id)
                .OrderByDescending(x => x.Id)
                .Take(200)
                .ToListAsync();
            var favorites = await db.Favorites.AsNoTracking()
                .Where(x => x.TargetType == "trader" && x.TargetId == id)
                .ToListAsync();

            var metrics = TraderScoring.Calculate(trader, reviews, deals, offers, listings, favorites);
            var completed = deals.Where(x => x.Status == "completed").ToList();
            var completionHours = completed
                .Where(x => x.CompletedAt.HasValue && x.CompletedAt.Value >= x.CreatedAt)
                .Select(x => (x.CompletedAt!.Value - x.CreatedAt).TotalHours)
                .ToList();
            double? averageCompletionHours = completionHours.Count == 0 ? null : Math.Round(completionHours.Average(), 1);
            var activeListings = listings.Where(x => x.Status == "active" && x.Stock > 0).Take(50).ToList();
            var distribution = Enumerable.Range(1, 5).ToDictionary(
                star => star,
                star => reviews.Count(x => x.Stars == star));

            return Results.Ok(new
            {
                trader = new
                {
                    id = trader.Id,
                    trader.DisplayName,
                    trader.CreatedAt,
                    trader.UserVerified,
                    trader.VerifiedTrader,
                    rating = metrics.Rating,
                    weightedRating = metrics.WeightedRating,
                    reviewCount = metrics.ReviewCount,
                    completedDeals = metrics.CompletedDeals,
                    refundedDeals = metrics.RefundedDeals,
                    resolvedDeals = metrics.CompletedDeals + metrics.RefundedDeals,
                    successRate = metrics.SuccessRate,
                    averageCompletionHours,
                    averageResponseMinutes = metrics.AverageResponseMinutes,
                    responseSamples = metrics.ResponseSamples,
                    followerCount = metrics.Followers,
                    activeListings = metrics.ActiveListings,
                    online = metrics.Online,
                    acceptingOffers = metrics.AcceptingOffers,
                    lastSeenAt = metrics.LastSeenAt,
                    kotakasScore = metrics.Score,
                    badges = metrics.Badges
                },
                ratingDistribution = distribution,
                reviews = reviews.Select(x => new
                {
                    x.Id,
                    x.DealId,
                    x.Stars,
                    x.Comment,
                    x.CreatedAt,
                    reviewer = reviewerNames.TryGetValue(x.ReviewerUserId, out var n) ? n : "Kullanıcı"
                }),
                listings = activeListings.Select(x => new
                {
                    x.Id,
                    x.ItemName,
                    x.ServerCode,
                    x.PriceGb,
                    x.Stock,
                    x.Status,
                    x.CreatedAt
                })
            });
        });

        return app;
    }
}
