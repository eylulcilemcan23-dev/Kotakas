using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class MarketplaceEndpoints
{
    public static IEndpointRouteBuilder MapMarketplaceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/public/stats", async (AppDbContext db) => Results.Ok(new
        {
            users = await db.Users.CountAsync(x => x.AccountStatus == "active"),
            traders = await db.Users.CountAsync(x => x.AccountStatus == "active" && x.VerifiedTrader),
            openRequests = await db.SaleRequests.CountAsync(x => x.Status == "open"),
            completedDeals = await db.Deals.CountAsync(x => x.Status == "completed")
        }));

        app.MapGet("/api/public/market-config", async (AppDbContext db) => Results.Ok(new
        {
            gbTryRate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m),
            paidListingTry = await ApiHelpers.SettingDecimal(db, "paid_listing_try", 0m)
        }));

        app.MapGet("/api/traders", async (AppDbContext db) =>
        {
            var traders = await db.Users.AsNoTracking()
                .Where(x => x.AccountStatus == "active" && x.VerifiedTrader)
                .OrderByDescending(x => x.CreatedAt).Take(12)
                .Select(x => new { id = x.Id, x.DisplayName, x.CreatedAt })
                .ToListAsync();
            var ids = traders.Select(x => x.id).ToList();
            var dealCounts = await db.Deals.AsNoTracking()
                .Where(x => ids.Contains(x.TraderUserId) && x.Status == "completed")
                .GroupBy(x => x.TraderUserId)
                .Select(g => new { id = g.Key, count = g.Count() })
                .ToDictionaryAsync(x => x.id, x => x.count);
            return Results.Ok(new { traders = traders.Select(x => new { x.id, x.DisplayName, completedDeals = dealCounts.TryGetValue(x.id, out var c) ? c : 0 }) });
        });

        app.MapGet("/api/sale-requests", async (string? server, string? search, AppDbContext db) =>
        {
            var q = db.SaleRequests.AsNoTracking().Include(x => x.Offers).Where(x => x.Status == "open");
            if (!string.IsNullOrWhiteSpace(server) && !server.Equals("ALL", StringComparison.OrdinalIgnoreCase)) q = q.Where(x => x.ServerCode == server.ToUpper());
            if (!string.IsNullOrWhiteSpace(search)) q = q.Where(x => x.ItemName.Contains(search));
            var rows = await q.OrderByDescending(x => x.Id).Take(200).ToListAsync();
            return Results.Ok(new { requests = rows.Select(ApiHelpers.RequestDto) });
        });

        app.MapGet("/api/sale-requests/mine", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var rows = await db.SaleRequests.AsNoTracking().Include(x => x.Offers).Where(x => x.UserId == ApiHelpers.UserId(p)).OrderByDescending(x => x.Id).Take(200).ToListAsync();
            return Results.Ok(new { requests = rows.Select(ApiHelpers.RequestDto) });
        }).RequireAuthorization();

        app.MapPost("/api/sale-requests", async (ClaimsPrincipal p, SaleRequestInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var item = (input.ItemName ?? "").Trim();
            var note = (input.Note ?? "").Trim();
            if (item.Length < 2 || input.MinimumGb <= 0 || input.Quantity < 1 || ApiHelpers.HasExternalContact(item + " " + note))
                return Results.BadRequest(new { error = "invalid_or_external_contact" });

            var start = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var used = await db.SaleRequests.CountAsync(x => x.UserId == uid && x.CreatedAt >= start);
            var isNormalUser = !p.IsInRole("trader") && !ApiHelpers.IsFullAdmin(p);
            var feeTry = 0m;

            await using var tx = await db.Database.BeginTransactionAsync();
            if (used >= 1 && isNormalUser)
            {
                feeTry = await ApiHelpers.SettingDecimal(db, "paid_listing_try", 0m);
                if (feeTry <= 0)
                    return Results.Json(new { error = "paid_listing_price_not_configured", requiresPayment = true }, statusCode: 503);
                var wallet = await ApiHelpers.WalletFor(db, uid);
                if (wallet.BalanceTry < feeTry)
                    return Results.Json(new { error = "listing_fee_balance_insufficient", requiresPayment = true, requiredTry = feeTry, balanceTry = wallet.BalanceTry }, statusCode: 402);
                var before = wallet.BalanceTry;
                wallet.BalanceTry -= feeTry;
                wallet.UpdatedAt = DateTimeOffset.UtcNow;
                db.WalletLedgers.Add(new WalletLedger
                {
                    UserId = uid,
                    AmountTry = -feeTry,
                    BeforeTry = before,
                    AfterTry = wallet.BalanceTry,
                    Type = "paid_sale_request",
                    Reason = $"Aylık ücretsiz hak sonrası satış talebi: {item}"
                });
            }

            var row = new SaleRequest
            {
                UserId = uid,
                ItemName = item,
                ServerCode = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant(),
                Quantity = input.Quantity,
                MinimumGb = input.MinimumGb,
                Note = note
            };
            db.SaleRequests.Add(row);
            await db.SaveChangesAsync();
            var traders = await db.Users.AsNoTracking().Where(x => x.VerifiedTrader && x.AccountStatus == "active").Select(x => x.Id).ToListAsync();
            db.Notifications.AddRange(traders.Select(id => new AppNotification { UserId = id, Title = "Yeni satış talebi", Body = $"{row.ServerCode} • {row.ItemName} • minimum {row.MinimumGb:0.##} GB" }));
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Json(new { ok = true, request = row, feeTry }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPost("/api/sale-requests/{id:long}/offers", async (long id, ClaimsPrincipal p, OfferInput input, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            if (!p.IsInRole("trader") && !ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            if (input.PriceGb <= 0) return Results.BadRequest(new { error = "invalid_price" });
            var request = await db.SaleRequests.FirstOrDefaultAsync(x => x.Id == id && x.Status == "open");
            if (request is null) return Results.NotFound();
            var uid = ApiHelpers.UserId(p);
            var user = await users.GetUserAsync(p);
            var offer = await db.Offers.FirstOrDefaultAsync(x => x.SaleRequestId == id && x.TraderUserId == uid && x.Status == "active");
            if (offer is null) { offer = new Offer { SaleRequestId = id, TraderUserId = uid, TraderName = user?.DisplayName ?? "Pazarcı" }; db.Offers.Add(offer); }
            offer.PriceGb = input.PriceGb;
            offer.ExpiryMinutes = Math.Clamp(input.ExpiryMinutes, 5, 1440);
            offer.CreatedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification { UserId = request.UserId, Title = "Yeni teklif", Body = $"{request.ItemName} için {offer.TraderName} {offer.PriceGb:0.##} GB teklif verdi." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, offer });
        }).RequireAuthorization();

        app.MapPost("/api/offers/{id:long}/accept", async (long id, ClaimsPrincipal p, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var offer = await db.Offers.Include(x => x.SaleRequest).FirstOrDefaultAsync(x => x.Id == id);
            var sellerUserId = ApiHelpers.UserId(p);
            if (offer?.SaleRequest is null || offer.SaleRequest.UserId != sellerUserId || offer.SaleRequest.Status != "open") return Results.NotFound();

            var rate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
            if (rate <= 0) return Results.Json(new { error = "market_rate_not_configured" }, statusCode: 503);
            var grossTry = Math.Round(offer.PriceGb * rate, 2, MidpointRounding.AwayFromZero);
            if (grossTry <= 0) return Results.BadRequest(new { error = "invalid_settlement_amount" });

            await using var tx = await db.Database.BeginTransactionAsync();
            var buyerWallet = await ApiHelpers.WalletFor(db, offer.TraderUserId);
            if (buyerWallet.BalanceTry < grossTry)
                return Results.Json(new { error = "buyer_balance_insufficient", requiredTry = grossTry, balanceTry = buyerWallet.BalanceTry }, statusCode: 402);

            var seller = await users.FindByIdAsync(sellerUserId);
            if (seller is null) return Results.NotFound();
            var sellerRoles = await users.GetRolesAsync(seller);
            var sellerIsTrader = sellerRoles.Contains("trader");
            var commissionPercent = await ApiHelpers.SettingDecimal(db, sellerIsTrader ? "trader_commission_percent" : "normal_commission_percent", sellerIsTrader ? 3m : 4m);
            commissionPercent = Math.Clamp(commissionPercent, 0m, 100m);
            var commissionTry = Math.Round(grossTry * commissionPercent / 100m, 2, MidpointRounding.AwayFromZero);
            var sellerNetTry = grossTry - commissionTry;

            var before = buyerWallet.BalanceTry;
            buyerWallet.BalanceTry -= grossTry;
            buyerWallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger { UserId = offer.TraderUserId, AmountTry = -grossTry, BeforeTry = before, AfterTry = buyerWallet.BalanceTry, Type = "escrow_fund", Reason = $"Anlaşma emanet fonu: {offer.SaleRequest.ItemName}" });

            offer.SaleRequest.Status = "matched";
            foreach (var sibling in await db.Offers.Where(x => x.SaleRequestId == offer.SaleRequestId).ToListAsync())
                sibling.Status = sibling.Id == offer.Id ? "accepted" : "declined";

            var deal = new Deal
            {
                SaleRequestId = offer.SaleRequestId,
                Flow = "request_offer",
                UserId = sellerUserId,
                TraderUserId = offer.TraderUserId,
                TraderName = offer.TraderName,
                ItemName = offer.SaleRequest.ItemName,
                ServerCode = offer.SaleRequest.ServerCode,
                Quantity = offer.SaleRequest.Quantity,
                UnitPriceGb = offer.PriceGb,
                PriceGb = offer.PriceGb,
                GbTryRate = rate,
                GrossTry = grossTry,
                EscrowTry = grossTry,
                CommissionPercent = commissionPercent,
                CommissionTry = commissionTry,
                SellerNetTry = sellerNetTry,
                Status = "funded"
            };
            db.Deals.Add(deal);
            db.Notifications.Add(new AppNotification { UserId = offer.TraderUserId, Title = "Teklifin kabul edildi", Body = $"{deal.ItemName} • {deal.PriceGb:0.##} GB • {deal.GrossTry:0.00} ₺ emanet bakiyeye alındı." });
            db.Notifications.Add(new AppNotification { UserId = sellerUserId, Title = "Güvenli işlem başladı", Body = $"{deal.GrossTry:0.00} ₺ emanet bakiyede. Item tesliminden sonra pazarcı onayı beklenir." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();

        app.MapGet("/api/offers/mine", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var rows = await db.Offers.AsNoTracking().Include(x => x.SaleRequest).Where(x => x.TraderUserId == ApiHelpers.UserId(p)).OrderByDescending(x => x.Id).Take(200).ToListAsync();
            return Results.Ok(new { offers = rows.Select(x => new { x.Id, x.SaleRequestId, itemName = x.SaleRequest!.ItemName, serverCode = x.SaleRequest.ServerCode, x.PriceGb, x.ExpiryMinutes, x.Status, x.CreatedAt }) });
        }).RequireAuthorization();

        app.MapGet("/api/listings", async (string? server, string? search, AppDbContext db) =>
        {
            var rate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
            var q = db.Listings.AsNoTracking().Where(x => x.Status == "active" && x.Stock > 0);
            if (!string.IsNullOrWhiteSpace(server) && !server.Equals("ALL", StringComparison.OrdinalIgnoreCase)) q = q.Where(x => x.ServerCode == server.ToUpper());
            if (!string.IsNullOrWhiteSpace(search)) q = q.Where(x => x.ItemName.Contains(search));
            var rows = await q.OrderByDescending(x => x.Id).Take(200).ToListAsync();
            return Results.Ok(new
            {
                gbTryRate = rate,
                listings = rows.Select(x => new { x.Id, x.SellerUserId, x.SellerName, x.ItemName, x.ServerCode, x.PriceGb, priceTry = rate > 0 ? Math.Round(x.PriceGb * rate, 2) : 0m, x.Stock, x.Status, x.CreatedAt })
            });
        });

        app.MapGet("/api/listings/mine", async (ClaimsPrincipal p, AppDbContext db) =>
            Results.Ok(new { listings = await db.Listings.AsNoTracking().Where(x => x.SellerUserId == ApiHelpers.UserId(p)).OrderByDescending(x => x.Id).Take(200).ToListAsync() })).RequireAuthorization();

        app.MapPost("/api/listings", async (ClaimsPrincipal p, ListingInput input, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            if (!p.IsInRole("trader") && !ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(input.ItemName) || input.PriceGb <= 0 || input.Stock < 1 || ApiHelpers.HasExternalContact(input.ItemName)) return Results.BadRequest(new { error = "invalid_listing" });
            var user = await users.GetUserAsync(p);
            var row = new TraderListing { SellerUserId = ApiHelpers.UserId(p), SellerName = user?.DisplayName ?? "Pazarcı", ItemName = input.ItemName.Trim(), ServerCode = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant(), PriceGb = input.PriceGb, Stock = input.Stock };
            db.Listings.Add(row);
            await db.SaveChangesAsync();
            return Results.Json(new { ok = true, listing = row }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPost("/api/listings/{id:long}/buy", async (long id, ClaimsPrincipal p, ListingPurchaseInput input, AppDbContext db) =>
        {
            var buyerUserId = ApiHelpers.UserId(p);
            var quantity = Math.Max(1, input.Quantity);
            await using var tx = await db.Database.BeginTransactionAsync();
            var listing = await db.Listings.FirstOrDefaultAsync(x => x.Id == id && x.Status == "active" && x.Stock > 0);
            if (listing is null) return Results.NotFound();
            if (listing.SellerUserId == buyerUserId) return Results.BadRequest(new { error = "cannot_buy_own_listing" });
            if (quantity > listing.Stock) return Results.BadRequest(new { error = "insufficient_stock", available = listing.Stock });

            var rate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
            if (rate <= 0) return Results.Json(new { error = "market_rate_not_configured" }, statusCode: 503);
            var totalGb = listing.PriceGb * quantity;
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
            db.WalletLedgers.Add(new WalletLedger { UserId = buyerUserId, AmountTry = -grossTry, BeforeTry = before, AfterTry = buyerWallet.BalanceTry, Type = "listing_escrow_fund", Reason = $"Pazarcı ilanı emanet fonu: {listing.ItemName} x{quantity}" });

            listing.Stock -= quantity;
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
                Quantity = quantity,
                UnitPriceGb = listing.PriceGb,
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
            db.Notifications.Add(new AppNotification { UserId = listing.SellerUserId, Title = "SELL ilanından satış", Body = $"{listing.ItemName} x{quantity} satın alındı. {grossTry:0.00} ₺ emanet bakiyede; teslim sonrası alıcı onayı beklenir." });
            db.Notifications.Add(new AppNotification { UserId = buyerUserId, Title = "Satın alma başladı", Body = $"{listing.ItemName} x{quantity} • {totalGb:0.##} GB • {grossTry:0.00} ₺ emanet bakiyeye alındı." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Json(new { ok = true, deal, remainingStock = listing.Stock }, statusCode: 201);
        }).RequireAuthorization();

        app.MapGet("/api/wallet", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var wallet = await db.Wallets.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == uid);
            var start = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var used = await db.SaleRequests.CountAsync(x => x.UserId == uid && x.CreatedAt >= start);
            var paidListingTry = await ApiHelpers.SettingDecimal(db, "paid_listing_try", 0m);
            var isNormalUser = !p.IsInRole("trader") && !ApiHelpers.IsFullAdmin(p);
            var nextRequestFeeTry = isNormalUser && used >= 1 ? paidListingTry : 0m;
            return Results.Ok(new
            {
                balanceTry = wallet?.BalanceTry ?? 0m,
                monthlyFreeUsed = Math.Min(used, 1),
                monthlyFreeRemaining = isNormalUser ? Math.Max(0, 1 - used) : 0,
                paidListingTry,
                nextRequestFeeTry
            });
        }).RequireAuthorization();
        return app;
    }
}

public record SaleRequestInput(string? ItemName, string? ServerCode, int Quantity, decimal MinimumGb, string? Note);
public record OfferInput(decimal PriceGb, int ExpiryMinutes = 10);
public record ListingInput(string? ItemName, string? ServerCode, decimal PriceGb, int Stock = 1);
public record ListingPurchaseInput(int Quantity = 1);
