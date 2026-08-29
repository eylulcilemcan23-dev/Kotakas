using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ReviewEndpoints
{
    public static IEndpointRouteBuilder MapReviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trust/traders", async (AppDbContext db) =>
        {
            var traders = await db.Users.AsNoTracking()
                .Where(x => x.AccountStatus == "active" && x.VerifiedTrader)
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new { x.Id, x.DisplayName })
                .ToListAsync();
            var ids = traders.Select(x => x.Id).ToList();
            var reviews = await db.TraderReviews.AsNoTracking().Where(x => ids.Contains(x.TraderUserId)).ToListAsync();
            var deals = await db.Deals.AsNoTracking().Where(x => ids.Contains(x.TraderUserId) && x.Status == "completed").ToListAsync();
            return Results.Ok(new
            {
                traders = traders.Select(t =>
                {
                    var rr = reviews.Where(x => x.TraderUserId == t.Id).ToList();
                    return new
                    {
                        id = t.Id,
                        t.DisplayName,
                        rating = rr.Count == 0 ? 0m : Math.Round((decimal)rr.Average(x => x.Stars), 2),
                        reviewCount = rr.Count,
                        completedDeals = deals.Count(x => x.TraderUserId == t.Id)
                    };
                })
            });
        });

        app.MapGet("/api/trust/traders/{id}", async (string id, AppDbContext db) =>
        {
            var trader = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.AccountStatus == "active" && x.VerifiedTrader);
            if (trader is null) return Results.NotFound();
            var rows = await db.TraderReviews.AsNoTracking().Where(x => x.TraderUserId == id).OrderByDescending(x => x.Id).Take(50).ToListAsync();
            var reviewerIds = rows.Select(x => x.ReviewerUserId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => reviewerIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName);
            var completed = await db.Deals.AsNoTracking().CountAsync(x => x.TraderUserId == id && x.Status == "completed");
            var rating = rows.Count == 0 ? 0m : Math.Round((decimal)rows.Average(x => x.Stars), 2);
            return Results.Ok(new
            {
                trader = new { id = trader.Id, trader.DisplayName, rating, reviewCount = rows.Count, completedDeals = completed },
                reviews = rows.Select(x => new { x.Id, x.DealId, x.Stars, x.Comment, x.CreatedAt, reviewer = names.TryGetValue(x.ReviewerUserId, out var n) ? n : "Kullanıcı" })
            });
        });

        app.MapGet("/api/deals/{id:long}/review-status", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var deal = await db.Deals.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (deal is null) return Results.NotFound();
            if (!ApiHelpers.DealAccess(deal, principal)) return Results.Forbid();
            var review = await db.TraderReviews.AsNoTracking().FirstOrDefaultAsync(x => x.DealId == id);
            return Results.Ok(new
            {
                canReview = deal.Status == "completed" && deal.UserId == ApiHelpers.UserId(principal) && review is null,
                review = review is null ? null : new { review.Id, review.Stars, review.Comment, review.CreatedAt }
            });
        }).RequireAuthorization();

        app.MapPost("/api/deals/{id:long}/review", async (long id, ClaimsPrincipal principal, TraderReviewInput input, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id);
            if (deal is null) return Results.NotFound();
            var uid = ApiHelpers.UserId(principal);
            if (deal.UserId != uid) return Results.Forbid();
            if (deal.Status != "completed") return Results.Conflict(new { error = "deal_not_completed" });
            if (input.Stars < 1 || input.Stars > 5) return Results.BadRequest(new { error = "invalid_stars" });
            var comment = (input.Comment ?? "").Trim();
            if (comment.Length > 200 || ApiHelpers.HasExternalContact(comment)) return Results.BadRequest(new { error = "invalid_review_comment" });
            if (await db.TraderReviews.AnyAsync(x => x.DealId == id)) return Results.Conflict(new { error = "review_already_exists" });

            var row = new TraderReview { DealId = id, TraderUserId = deal.TraderUserId, ReviewerUserId = uid, Stars = input.Stars, Comment = comment };
            db.TraderReviews.Add(row);
            db.Notifications.Add(new AppNotification { UserId = deal.TraderUserId, Title = "Yeni işlem değerlendirmesi", Body = $"Tamamlanan {deal.ItemName} işlemi için {input.Stars}/5 puan aldın." });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "review_already_exists" }); }
            return Results.Json(new { ok = true, review = row }, statusCode: 201);
        }).RequireAuthorization();

        return app;
    }
}

public record TraderReviewInput(int Stars, string? Comment);
