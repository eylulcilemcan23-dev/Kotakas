using Kotakas.Web.Models;

namespace Kotakas.Web.Services;

public sealed record TraderScoreSnapshot(
    decimal Score,
    decimal Rating,
    decimal WeightedRating,
    int ReviewCount,
    int CompletedDeals,
    int RefundedDeals,
    decimal? SuccessRate,
    double? AverageResponseMinutes,
    int ResponseSamples,
    int ActiveListings,
    int Followers,
    bool Online,
    bool AcceptingOffers,
    DateTimeOffset? LastSeenAt,
    IReadOnlyList<object> Badges);

public static class TraderScoring
{
    public static TraderScoreSnapshot Calculate(
        ApplicationUser trader,
        IEnumerable<TraderReview> allReviews,
        IEnumerable<Deal> allDeals,
        IEnumerable<Offer> allOffers,
        IEnumerable<TraderListing> allListings,
        IEnumerable<Favorite> allFavorites,
        DateTimeOffset? now = null)
    {
        var utcNow = now ?? DateTimeOffset.UtcNow;
        var reviews = allReviews.Where(x => x.TraderUserId == trader.Id).ToList();
        var deals = allDeals.Where(x => x.TraderUserId == trader.Id).ToList();
        var completed = deals.Count(x => x.Status == "completed");
        var refunded = deals.Count(x => x.Status == "refunded");
        var resolved = completed + refunded;
        decimal? successRate = resolved == 0 ? null : Math.Round(completed * 100m / resolved, 1);

        var rating = reviews.Count == 0 ? 0m : Math.Round((decimal)reviews.Average(x => x.Stars), 2);
        // Bayesian smoothing: 10 synthetic reviews at 4.5 prevent a brand-new 5-star account from instantly outranking proven traders.
        const decimal priorRating = 4.5m;
        const int priorWeight = 10;
        var weightedRating = Math.Round(((rating * reviews.Count) + (priorRating * priorWeight)) / (reviews.Count + priorWeight), 3);

        var responseMinutes = allOffers
            .Where(x => x.TraderUserId == trader.Id && x.SaleRequest is not null)
            .GroupBy(x => x.SaleRequestId)
            .Select(g =>
            {
                var first = g.OrderBy(x => x.CreatedAt).First();
                return (first.CreatedAt - first.SaleRequest!.CreatedAt).TotalMinutes;
            })
            .Where(x => x >= 0 && x <= 4320)
            .ToList();
        double? averageResponseMinutes = responseMinutes.Count == 0 ? null : Math.Round(responseMinutes.Average(), 1);

        var activeListings = allListings.Count(x => x.SellerUserId == trader.Id && x.Status == "active" && x.Stock > 0);
        var followers = allFavorites.Count(x => x.TargetType == "trader" && x.TargetId == trader.Id);
        var online = trader.LastSeenAt.HasValue && trader.LastSeenAt.Value >= utcNow.AddSeconds(-150);

        var ratingScore = (weightedRating / 5m) * 25m;
        var successScore = successRate.HasValue ? successRate.Value / 100m * 20m : 10m;
        var volumeScore = completed <= 0 ? 0m : (decimal)Math.Min(15d, Math.Log10(completed + 1d) / Math.Log10(101d) * 15d);
        var responseScore = ResponseScore(averageResponseMinutes);
        var onlineScore = online ? 10m : 0m;
        var acceptingScore = trader.TraderAcceptingOffers ? 5m : 0m;
        var verifiedAccountScore = trader.UserVerified ? 5m : 0m;
        var followerScore = followers <= 0 ? 0m : (decimal)Math.Min(5d, Math.Log10(followers + 1d) / Math.Log10(101d) * 5d);
        var listingScore = Math.Min(5m, activeListings);
        var score = Math.Round(Math.Clamp(ratingScore + successScore + volumeScore + responseScore + onlineScore + acceptingScore + verifiedAccountScore + followerScore + listingScore, 0m, 100m), 1);

        var badges = new List<object>
        {
            new { code = "verified_trader", label = "Doğrulanmış Pazarcı", icon = "✓" }
        };
        if (online) badges.Add(new { code = "online", label = "Şu an Online", icon = "●" });
        if (trader.UserVerified) badges.Add(new { code = "verified_account", label = "Hesap Doğrulandı", icon = "🛡️" });
        if (responseMinutes.Count >= 3 && averageResponseMinutes <= 15) badges.Add(new { code = "fast_response", label = "Hızlı Yanıt", icon = "⚡" });
        if (completed >= 10) badges.Add(new { code = "deals_10", label = "10+ İşlem", icon = "🤝" });
        if (completed >= 50) badges.Add(new { code = "deals_50", label = "50+ İşlem", icon = "🏅" });
        if (completed >= 100) badges.Add(new { code = "deals_100", label = "100+ İşlem", icon = "🏆" });
        if (reviews.Count >= 5 && rating >= 4.8m) badges.Add(new { code = "rating_48", label = "4.8+ Puan", icon = "⭐" });
        if (resolved >= 10 && successRate >= 98m) badges.Add(new { code = "success_98", label = "%98+ Başarı", icon = "💎" });

        return new TraderScoreSnapshot(
            score,
            rating,
            weightedRating,
            reviews.Count,
            completed,
            refunded,
            successRate,
            averageResponseMinutes,
            responseMinutes.Count,
            activeListings,
            followers,
            online,
            trader.TraderAcceptingOffers,
            trader.LastSeenAt,
            badges);
    }

    private static decimal ResponseScore(double? minutes)
    {
        if (!minutes.HasValue) return 0m;
        if (minutes <= 5) return 10m;
        if (minutes <= 15) return 8m;
        if (minutes <= 30) return 6m;
        if (minutes <= 60) return 4m;
        if (minutes <= 180) return 2m;
        return 0m;
    }
}
