using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class FavoriteEndpoints
{
    public static IEndpointRouteBuilder MapFavoriteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/favorites").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var favorites = await db.Favorites.AsNoTracking()
                .Where(x => x.UserId == uid)
                .OrderByDescending(x => x.CreatedAt)
                .ToListAsync();

            var listingFavoriteIds = favorites
                .Where(x => x.TargetType == "listing")
                .Select(x => long.TryParse(x.TargetId, out var id) ? id : 0)
                .Where(x => x > 0)
                .Distinct()
                .ToList();
            var traderFavoriteIds = favorites
                .Where(x => x.TargetType == "trader")
                .Select(x => x.TargetId)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct()
                .ToList();

            var listings = await db.Listings.AsNoTracking()
                .Where(x => listingFavoriteIds.Contains(x.Id))
                .ToListAsync();
            var traders = await db.Users.AsNoTracking()
                .Where(x => traderFavoriteIds.Contains(x.Id))
                .Select(x => new { x.Id, x.DisplayName, x.VerifiedTrader, x.AccountStatus, x.CreatedAt })
                .ToListAsync();

            var traderIdsForStats = listings.Select(x => x.SellerUserId)
                .Concat(traders.Select(x => x.Id))
                .Distinct()
                .ToList();
            var reviewStats = await db.TraderReviews.AsNoTracking()
                .Where(x => traderIdsForStats.Contains(x.TraderUserId))
                .GroupBy(x => x.TraderUserId)
                .Select(g => new { traderUserId = g.Key, rating = g.Average(x => x.Stars), reviews = g.Count() })
                .ToListAsync();
            var reviewMap = reviewStats.ToDictionary(x => x.traderUserId, x => new { x.rating, x.reviews });
            var completedDeals = await db.Deals.AsNoTracking()
                .Where(x => traderIdsForStats.Contains(x.TraderUserId) && x.Status == "completed")
                .GroupBy(x => x.TraderUserId)
                .Select(g => new { traderUserId = g.Key, count = g.Count() })
                .ToDictionaryAsync(x => x.traderUserId, x => x.count);

            var listingMap = listings.ToDictionary(x => x.Id);
            var traderMap = traders.ToDictionary(x => x.Id);

            var listingRows = favorites.Where(x => x.TargetType == "listing")
                .Select(f =>
                {
                    if (!long.TryParse(f.TargetId, out var id) || !listingMap.TryGetValue(id, out var x))
                        return new { favoriteId = f.Id, id = 0L, missing = true, sellerUserId = "", sellerName = "", itemName = "İlan artık mevcut değil", serverCode = "", priceGb = 0m, stock = 0, status = "missing", createdAt = f.CreatedAt, rating = 0d, reviews = 0 };
                    var stat = reviewMap.TryGetValue(x.SellerUserId, out var s) ? s : null;
                    return new { favoriteId = f.Id, id = x.Id, missing = false, x.SellerUserId, x.SellerName, x.ItemName, x.ServerCode, x.PriceGb, x.Stock, x.Status, createdAt = f.CreatedAt, rating = stat?.rating ?? 0d, reviews = stat?.reviews ?? 0 };
                }).ToList();

            var traderRows = favorites.Where(x => x.TargetType == "trader")
                .Select(f =>
                {
                    if (!traderMap.TryGetValue(f.TargetId, out var x))
                        return new { favoriteId = f.Id, id = "", missing = true, displayName = "Pazarcı artık mevcut değil", verifiedTrader = false, accountStatus = "missing", createdAt = f.CreatedAt, rating = 0d, reviews = 0, completedDeals = 0 };
                    var stat = reviewMap.TryGetValue(x.Id, out var s) ? s : null;
                    return new { favoriteId = f.Id, id = x.Id, missing = false, x.DisplayName, x.VerifiedTrader, x.AccountStatus, createdAt = f.CreatedAt, rating = stat?.rating ?? 0d, reviews = stat?.reviews ?? 0, completedDeals = completedDeals.TryGetValue(x.Id, out var count) ? count : 0 };
                }).ToList();

            return Results.Ok(new
            {
                listingIds = listingRows.Where(x => !x.missing).Select(x => x.id).ToArray(),
                traderIds = traderRows.Where(x => !x.missing).Select(x => x.id).ToArray(),
                listings = listingRows,
                traders = traderRows,
                total = favorites.Count
            });
        });

        group.MapPost("/{type}/{targetId}", async (string type, string targetId, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            type = (type ?? "").Trim().ToLowerInvariant();
            targetId = (targetId ?? "").Trim();
            if (type is not ("listing" or "trader") || targetId.Length == 0)
                return Results.BadRequest(new { error = "invalid_favorite_target" });

            if (type == "listing")
            {
                if (!long.TryParse(targetId, out var listingId) || listingId <= 0) return Results.BadRequest(new { error = "invalid_listing" });
                var listing = await db.Listings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == listingId);
                if (listing is null) return Results.NotFound();
                if (listing.SellerUserId == uid) return Results.BadRequest(new { error = "cannot_favorite_own_listing" });
                targetId = listing.Id.ToString();
            }
            else
            {
                var trader = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == targetId && x.VerifiedTrader);
                if (trader is null) return Results.NotFound();
                if (trader.Id == uid) return Results.BadRequest(new { error = "cannot_favorite_self" });
            }

            var exists = await db.Favorites.AnyAsync(x => x.UserId == uid && x.TargetType == type && x.TargetId == targetId);
            if (exists) return Results.Ok(new { ok = true, favorite = true, existed = true });

            db.Favorites.Add(new Favorite { UserId = uid, TargetType = type, TargetId = targetId });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                if (await db.Favorites.AnyAsync(x => x.UserId == uid && x.TargetType == type && x.TargetId == targetId))
                    return Results.Ok(new { ok = true, favorite = true, existed = true });
                throw;
            }
            return Results.Json(new { ok = true, favorite = true }, statusCode: 201);
        });

        group.MapDelete("/{type}/{targetId}", async (string type, string targetId, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            type = (type ?? "").Trim().ToLowerInvariant();
            targetId = (targetId ?? "").Trim();
            if (type is not ("listing" or "trader") || targetId.Length == 0)
                return Results.BadRequest(new { error = "invalid_favorite_target" });
            var rows = await db.Favorites.Where(x => x.UserId == uid && x.TargetType == type && x.TargetId == targetId).ToListAsync();
            if (rows.Count == 0) return Results.Ok(new { ok = true, favorite = false });
            db.Favorites.RemoveRange(rows);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, favorite = false });
        });

        return app;
    }
}
