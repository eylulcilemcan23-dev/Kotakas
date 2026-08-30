using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ListingEnhancementEndpoints
{
    public static IEndpointRouteBuilder MapListingEnhancementEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/listings/{id:long}/details", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var listing = await db.Listings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Status != "cancelled");
            if (listing is null) return Results.NotFound();

            var historyRows = await db.Set<ListingPriceHistory>().AsNoTracking()
                .Where(x => x.ListingId == id)
                .OrderByDescending(x => x.Id)
                .Take(30)
                .ToListAsync();
            var histories = historyRows
                .OrderBy(x => x.CreatedAt)
                .Select(x => new { x.PriceGb, x.Reason, x.CreatedAt })
                .ToList();

            var favoriteCount = await db.Favorites.AsNoTracking()
                .CountAsync(x => x.TargetType == "listing" && x.TargetId == id.ToString());
            var reviewStats = await db.TraderReviews.AsNoTracking()
                .Where(x => x.TraderUserId == listing.SellerUserId)
                .GroupBy(_ => 1)
                .Select(g => new { count = g.Count(), rating = g.Average(x => x.Stars) })
                .FirstOrDefaultAsync();
            var completedDeals = await db.Deals.AsNoTracking()
                .CountAsync(x => x.TraderUserId == listing.SellerUserId && x.Status == "completed");

            object? myOffer = null;
            var uid = ApiHelpers.UserId(principal);
            if (!string.IsNullOrWhiteSpace(uid))
            {
                var offer = await db.Set<ListingPriceOffer>().AsNoTracking()
                    .Where(x => x.ListingId == id && x.BuyerUserId == uid && x.Status != "purchased")
                    .OrderByDescending(x => x.Id)
                    .FirstOrDefaultAsync();
                if (offer is not null)
                    myOffer = OfferDto(offer, listing);
            }

            return Results.Ok(new
            {
                listing = new
                {
                    listing.Id,
                    listing.SellerUserId,
                    listing.SellerName,
                    listing.ItemName,
                    listing.ServerCode,
                    listing.PriceGb,
                    listing.Stock,
                    listing.Status,
                    listing.CreatedAt,
                    favoriteCount,
                    traderRating = reviewStats?.rating ?? 0,
                    traderReviews = reviewStats?.count ?? 0,
                    traderCompletedDeals = completedDeals
                },
                priceHistory = histories,
                myOffer
            });
        });

        app.MapGet("/api/listing-price-offers/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            await ExpireStaleOffers(db);
            var rows = await db.Set<ListingPriceOffer>().AsNoTracking().Include(x => x.Listing)
                .Where(x => x.BuyerUserId == uid || x.Listing!.SellerUserId == uid)
                .OrderByDescending(x => x.Id)
                .Take(200)
                .ToListAsync();
            return Results.Ok(new
            {
                offers = rows.Select(x => new
                {
                    x.Id,
                    x.ListingId,
                    x.BuyerUserId,
                    x.BuyerName,
                    x.Quantity,
                    x.OfferGbPerUnit,
                    x.Status,
                    x.CreatedAt,
                    x.ExpiresAt,
                    x.RespondedAt,
                    x.PurchasedDealId,
                    role = x.BuyerUserId == uid ? "buyer" : "seller",
                    listing = x.Listing is null ? null : new { x.Listing.ItemName, x.Listing.ServerCode, x.Listing.PriceGb, x.Listing.Stock, x.Listing.SellerName, x.Listing.SellerUserId }
                })
            });
        }).RequireAuthorization();

        app.MapPost("/api/listings/{id:long}/price-offers", async (long id, ClaimsPrincipal principal, ListingPriceOfferInput input, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var listing = await db.Listings.FirstOrDefaultAsync(x => x.Id == id && x.Status == "active" && x.Stock > 0);
            if (listing is null) return Results.NotFound();
            if (listing.SellerUserId == uid) return Results.BadRequest(new { error = "cannot_offer_own_listing" });
            var quantity = Math.Clamp(input.Quantity, 1, 100000);
            if (quantity > listing.Stock) return Results.BadRequest(new { error = "insufficient_stock", available = listing.Stock });
            if (input.OfferGbPerUnit <= 0 || input.OfferGbPerUnit >= listing.PriceGb)
                return Results.BadRequest(new { error = "offer_must_be_below_listing_price", listingPriceGb = listing.PriceGb });

            await ExpireStaleOffers(db);
            var buyer = await users.GetUserAsync(principal);
            var row = await db.Set<ListingPriceOffer>().FirstOrDefaultAsync(x => x.ListingId == id && x.BuyerUserId == uid && x.Status == "pending");
            if (row is null)
            {
                row = new ListingPriceOffer { ListingId = id, BuyerUserId = uid, BuyerName = buyer?.DisplayName ?? "Kullanıcı" };
                db.Set<ListingPriceOffer>().Add(row);
            }
            row.Quantity = quantity;
            row.OfferGbPerUnit = input.OfferGbPerUnit;
            row.Status = "pending";
            row.CreatedAt = DateTimeOffset.UtcNow;
            row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30);
            row.RespondedAt = null;
            row.PurchasedDealId = null;
            db.Notifications.Add(new AppNotification
            {
                UserId = listing.SellerUserId,
                Title = "SELL ilanına fiyat teklifi",
                Body = $"{row.BuyerName}, {listing.ItemName} x{quantity} için adet başı {row.OfferGbPerUnit:0.##} GB teklif verdi."
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, offer = OfferDto(row, listing) });
        }).RequireAuthorization();

        app.MapPost("/api/listing-price-offers/{id:long}/decision", async (long id, ClaimsPrincipal principal, ListingPriceOfferDecision input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var row = await db.Set<ListingPriceOffer>().Include(x => x.Listing).FirstOrDefaultAsync(x => x.Id == id);
            if (row?.Listing is null) return Results.NotFound();
            if (row.Listing.SellerUserId != uid && !ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            if (row.Status != "pending") return Results.Conflict(new { error = "offer_not_pending", status = row.Status });
            if (row.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                row.Status = "expired";
                await db.SaveChangesAsync();
                return Results.Conflict(new { error = "price_offer_expired" });
            }

            var action = (input.Action ?? "").Trim().ToLowerInvariant();
            if (action is not ("accept" or "decline")) return Results.BadRequest(new { error = "invalid_decision" });
            row.RespondedAt = DateTimeOffset.UtcNow;
            if (action == "accept")
            {
                if (row.Listing.Status != "active" || row.Listing.Stock < row.Quantity)
                    return Results.Conflict(new { error = "listing_stock_changed" });
                row.Status = "accepted";
                row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
                db.Notifications.Add(new AppNotification
                {
                    UserId = row.BuyerUserId,
                    Title = "Fiyat teklifin kabul edildi",
                    Body = $"{row.Listing.ItemName} x{row.Quantity} • {row.OfferGbPerUnit:0.##} GB/adet. Bu fiyattan satın almak için 10 dakikan var."
                });
            }
            else
            {
                row.Status = "declined";
                db.Notifications.Add(new AppNotification
                {
                    UserId = row.BuyerUserId,
                    Title = "Fiyat teklifin reddedildi",
                    Body = $"{row.Listing.ItemName} için verdiğin teklif pazarcı tarafından kabul edilmedi."
                });
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, offer = OfferDto(row, row.Listing) });
        }).RequireAuthorization();

        app.MapPost("/api/listing-price-offers/{id:long}/purchase", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var buyerUserId = ApiHelpers.UserId(principal);
            await using var tx = await db.Database.BeginTransactionAsync();
            var offer = await db.Set<ListingPriceOffer>().Include(x => x.Listing).FirstOrDefaultAsync(x => x.Id == id);
            if (offer?.Listing is null) return Results.NotFound();
            if (offer.BuyerUserId != buyerUserId) return Results.Forbid();
            if (offer.Status != "accepted") return Results.Conflict(new { error = "price_offer_not_accepted", status = offer.Status });
            if (offer.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                offer.Status = "expired";
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return Results.Conflict(new { error = "price_offer_expired" });
            }

            var listing = offer.Listing;
            if (listing.Status != "active" || listing.Stock < offer.Quantity)
                return Results.Conflict(new { error = "listing_stock_changed", available = listing.Stock });
            if (listing.SellerUserId == buyerUserId) return Results.BadRequest(new { error = "cannot_buy_own_listing" });

            var rate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
            if (rate <= 0) return Results.Json(new { error = "market_rate_not_configured" }, statusCode: 503);
            var totalGb = offer.OfferGbPerUnit * offer.Quantity;
            var grossTry = Math.Round(totalGb * rate, 2, MidpointRounding.AwayFromZero);
            var buyerWallet = await ApiHelpers.WalletFor(db, buyerUserId);
            if (buyerWallet.BalanceTry < grossTry)
                return Results.Json(new { error = "buyer_balance_insufficient", requiredTry = grossTry, balanceTry = buyerWallet.BalanceTry }, statusCode: 402);

            var commissionPercent = Math.Clamp(await ApiHelpers.SettingDecimal(db, "trader_commission_percent", 3m), 0m, 100m);
            var commissionTry = Math.Round(grossTry * commissionPercent / 100m, 2, MidpointRounding.AwayFromZero);
            var sellerNetTry = grossTry - commissionTry;
            var before = buyerWallet.BalanceTry;
            buyerWallet.BalanceTry -= grossTry;
            buyerWallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger
            {
                UserId = buyerUserId,
                AmountTry = -grossTry,
                BeforeTry = before,
                AfterTry = buyerWallet.BalanceTry,
                Type = "listing_offer_escrow_fund",
                Reason = $"Kabul edilen fiyat teklifi emanet fonu: {listing.ItemName} x{offer.Quantity}"
            });

            listing.Stock -= offer.Quantity;
            if (listing.Stock <= 0) listing.Status = "sold_out";
            var deal = new Deal
            {
                TraderListingId = listing.Id,
                Flow = "trader_listing",
                UserId = buyerUserId,
                TraderUserId = listing.SellerUserId,
                TraderName = listing.SellerName,
                ItemName = listing.ItemName,
                ServerCode = listing.ServerCode,
                Quantity = offer.Quantity,
                UnitPriceGb = offer.OfferGbPerUnit,
                PriceGb = totalGb,
                GbTryRate = rate,
                GrossTry = grossTry,
                EscrowTry = grossTry,
                CommissionPercent = commissionPercent,
                CommissionTry = commissionTry,
                SellerNetTry = sellerNetTry,
                Status = "funded"
            };
            db.Deals.Add(deal);
            await db.SaveChangesAsync();
            offer.Status = "purchased";
            offer.PurchasedDealId = deal.Id;
            offer.RespondedAt ??= DateTimeOffset.UtcNow;

            var siblings = await db.Set<ListingPriceOffer>()
                .Where(x => x.ListingId == listing.Id && x.BuyerUserId == buyerUserId && x.Id != offer.Id && (x.Status == "pending" || x.Status == "accepted"))
                .ToListAsync();
            foreach (var sibling in siblings) sibling.Status = "expired";

            db.Notifications.Add(new AppNotification
            {
                UserId = listing.SellerUserId,
                Title = "Kabul ettiğin teklif satın alındı",
                Body = $"{listing.ItemName} x{offer.Quantity} • {totalGb:0.##} GB • {grossTry:0.00} ₺ emanet bakiyede."
            });
            db.Notifications.Add(new AppNotification
            {
                UserId = buyerUserId,
                Title = "Teklif fiyatından güvenli işlem başladı",
                Body = $"{listing.ItemName} x{offer.Quantity} • {totalGb:0.##} GB • {grossTry:0.00} ₺ emanet bakiyeye alındı."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Json(new { ok = true, deal, remainingStock = listing.Stock }, statusCode: 201);
        }).RequireAuthorization();

        return app;
    }

    private static async Task ExpireStaleOffers(AppDbContext db)
    {
        var now = DateTimeOffset.UtcNow;
        var candidates = await db.Set<ListingPriceOffer>()
            .Where(x => x.Status == "pending" || x.Status == "accepted")
            .ToListAsync();
        var rows = candidates.Where(x => x.ExpiresAt <= now).ToList();
        if (rows.Count == 0) return;
        foreach (var row in rows) row.Status = "expired";
        await db.SaveChangesAsync();
    }

    private static object OfferDto(ListingPriceOffer x, TraderListing listing) => new
    {
        x.Id,
        x.ListingId,
        x.BuyerUserId,
        x.BuyerName,
        x.Quantity,
        x.OfferGbPerUnit,
        x.Status,
        x.CreatedAt,
        x.ExpiresAt,
        x.RespondedAt,
        x.PurchasedDealId,
        listing = new { listing.ItemName, listing.ServerCode, listing.PriceGb, listing.Stock, listing.SellerName, listing.SellerUserId }
    };
}

public record ListingPriceOfferInput(decimal OfferGbPerUnit, int Quantity = 1);
public record ListingPriceOfferDecision(string? Action);
