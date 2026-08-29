using Kotakas.Web.Data;
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
            var completed = deals.Where(x => x.Status == "completed").ToList();
            var refunded = deals.Count(x => x.Status == "refunded");
            var resolved = completed.Count + refunded;
            decimal? successRate = resolved == 0 ? null : Math.Round(completed.Count * 100m / resolved, 1);
            var completionHours = completed
                .Where(x => x.CompletedAt.HasValue && x.CompletedAt.Value >= x.CreatedAt)
                .Select(x => (x.CompletedAt!.Value - x.CreatedAt).TotalHours)
                .ToList();
            double? averageCompletionHours = completionHours.Count == 0 ? null : Math.Round(completionHours.Average(), 1);
            var rating = reviews.Count == 0 ? 0m : Math.Round((decimal)reviews.Average(x => x.Stars), 2);

            var listings = await db.Listings.AsNoTracking()
                .Where(x => x.SellerUserId == id && x.Status == "active" && x.Stock > 0)
                .OrderByDescending(x => x.Id)
                .Take(50)
                .ToListAsync();
            var followerCount = await db.Favorites.AsNoTracking().CountAsync(x => x.TargetType == "trader" && x.TargetId == id);
            var distribution = Enumerable.Range(1, 5).ToDictionary(
                star => star,
                star => reviews.Count(x => x.Stars == star));

            var badges = new List<object>();
            badges.Add(new { code = "verified_trader", label = "Doğrulanmış Pazarcı", icon = "✓" });
            if (trader.UserVerified) badges.Add(new { code = "verified_account", label = "Hesap Doğrulandı", icon = "🛡️" });
            if (completed.Count >= 10) badges.Add(new { code = "deals_10", label = "10+ İşlem", icon = "🤝" });
            if (completed.Count >= 50) badges.Add(new { code = "deals_50", label = "50+ İşlem", icon = "🏅" });
            if (completed.Count >= 100) badges.Add(new { code = "deals_100", label = "100+ İşlem", icon = "🏆" });
            if (reviews.Count >= 5 && rating >= 4.8m) badges.Add(new { code = "rating_48", label = "4.8+ Puan", icon = "⭐" });
            if (resolved >= 10 && successRate >= 98m) badges.Add(new { code = "success_98", label = "%98+ Başarı", icon = "💎" });

            return Results.Ok(new
            {
                trader = new
                {
                    id = trader.Id,
                    trader.DisplayName,
                    trader.CreatedAt,
                    trader.UserVerified,
                    trader.VerifiedTrader,
                    rating,
                    reviewCount = reviews.Count,
                    completedDeals = completed.Count,
                    refundedDeals = refunded,
                    resolvedDeals = resolved,
                    successRate,
                    averageCompletionHours,
                    followerCount,
                    activeListings = listings.Count,
                    badges
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
                listings = listings.Select(x => new
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
