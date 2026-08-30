using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ListingManagementEndpoints
{
    public static IEndpointRouteBuilder MapListingManagementEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/listings/{id:long}", async (long id, ClaimsPrincipal principal, ListingManageInput input, AppDbContext db) =>
        {
            var row = await db.Listings.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.SellerUserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            if (row.Status == "cancelled") return Results.Conflict(new { error = "listing_cancelled" });

            var previousPrice = row.PriceGb;
            var nextPrice = input.PriceGb ?? row.PriceGb;
            var nextStock = input.Stock ?? row.Stock;
            var nextStatus = string.IsNullOrWhiteSpace(input.Status) ? row.Status : input.Status.Trim().ToLowerInvariant();
            if (nextPrice <= 0 || nextPrice > 100000 || nextStock < 0 || nextStock > 100000 || nextStatus is not ("active" or "paused" or "sold_out"))
                return Results.BadRequest(new { error = "invalid_listing_update" });
            if (nextStock == 0) nextStatus = "sold_out";
            if (nextStock > 0 && nextStatus == "sold_out") nextStatus = "paused";

            row.PriceGb = nextPrice;
            row.Stock = nextStock;
            row.Status = nextStatus;
            if (previousPrice != nextPrice)
            {
                db.Set<ListingPriceHistory>().Add(new ListingPriceHistory
                {
                    ListingId = row.Id,
                    PriceGb = nextPrice,
                    Reason = nextPrice < previousPrice ? "price_drop" : "price_increase",
                    CreatedAt = DateTimeOffset.UtcNow
                });
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, listing = row });
        }).RequireAuthorization();

        app.MapDelete("/api/listings/{id:long}", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var row = await db.Listings.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.SellerUserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            row.Status = "cancelled";
            var pendingOffers = await db.Set<ListingPriceOffer>()
                .Where(x => x.ListingId == id && (x.Status == "pending" || x.Status == "accepted"))
                .ToListAsync();
            foreach (var offer in pendingOffers) offer.Status = "expired";
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = row.Status });
        }).RequireAuthorization();

        return app;
    }
}

public record ListingManageInput(decimal? PriceGb, int? Stock, string? Status);
