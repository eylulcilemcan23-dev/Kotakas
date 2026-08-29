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
            var reviewMap = reviewStats.ToDictionary(x => x.traderUserId, x => (x.rating, x.reviews));
            var completedDeals = await db.Deals.AsNoTracking()
                .Where(x => traderIdsForStats.Contains(x.TraderUserId) && x.Status == "completed")
                .GroupBy(x => x.TraderUserId)
                .Select(g => new { traderUserId = g.Key, count = g.Count() })
                .ToDictionaryAsync(x => x.traderUserId, x => x.count);

            var listingMap = listings.ToDictionary(x => x.Id);
            var traderMap = traders.ToDictionary(x => x.Id);
            var listingRows = new List<FavoriteListingDto>();
            var traderRows = new List<FavoriteTraderDto>();

            foreach (var f in favorites.Where(x => x.TargetType == "listing"))
            {
                var parsedId = long.TryParse(f.TargetId, out var candidateId) ? candidateId : 0;
                if (parsedId <= 0 || !listingMap.TryGetValue(parsedId, out var x))
                {
                    listingRows.Add(new FavoriteListingDto(f.Id, parsedId, true, "", "", "İlan artık mevcut değil", "", 0, 0, "missing", f.CreatedAt, 0, 0));
                    continue;
                }
                var stat = reviewMap.TryGetValue(x.SellerUserId, out var s) ? s : (0d, 0);
                listingRows.Add(new FavoriteListingDto(f.Id, x.Id, false, x.SellerUserId, x.SellerName, x.ItemName, x.ServerCode, x.PriceGb, x.Stock, x.Status, f.CreatedAt, stat.Item1, stat.Item2));
            }

            foreach (var f in favorites.Where(x => x.TargetType == "trader"))
            {
                if (!traderMap.TryGetValue(f.TargetId, out var x))
                {
                    traderRows.Add(new FavoriteTraderDto(f.Id, f.TargetId, true, "Pazarcı artık mevcut değil", false, "missing", f.CreatedAt, 0, 0, 0));
                    continue;
                }
                var stat = reviewMap.TryGetValue(x.Id, out var s) ? s : (0d, 0);
                traderRows.Add(new FavoriteTraderDto(f.Id, x.Id, false, x.DisplayName, x.VerifiedTrader, x.AccountStatus, f.CreatedAt, stat.Item1, stat.Item2, completedDeals.TryGetValue(x.Id, out var count) ? count : 0));
            }

            return Results.Ok(new
            {
                listingIds = listingRows.Where(x => !x.Missing).Select(x => x.Id).ToArray(),
                traderIds = traderRows.Where(x => !x.Missing).Select(x => x.Id).ToArray(),
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

public sealed record FavoriteListingDto(long FavoriteId, long Id, bool Missing, string SellerUserId, string SellerName, string ItemName, string ServerCode, decimal PriceGb, int Stock, string Status, DateTimeOffset CreatedAt, double Rating, int Reviews);
public sealed record FavoriteTraderDto(long FavoriteId, string Id, bool Missing, string DisplayName, bool VerifiedTrader, string AccountStatus, DateTimeOffset CreatedAt, double Rating, int Reviews, int CompletedDeals);
