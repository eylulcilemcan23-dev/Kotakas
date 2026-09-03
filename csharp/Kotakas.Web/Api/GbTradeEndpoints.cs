using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class GbTradeEndpoints
{
    public static IEndpointRouteBuilder MapGbTradeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/gb-trade/requests", async (ClaimsPrincipal principal, GbSellRequestInput input, AppDbContext db) =>
        {
            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();

            var itemName = (input.ItemName ?? "").Trim();
            var serverCode = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant();
            var note = (input.Note ?? "").Trim();
            var minimumGb = input.MinimumGb;
            var quantity = Math.Max(1, input.Quantity);

            if (itemName.Length < 2 || minimumGb <= 0)
                return Results.BadRequest(new { error = "invalid_request" });

            var row = new SaleRequest
            {
                UserId = userId,
                GameCode = "knight-online",
                ProductType = "item",
                CurrencyCode = "GB",
                ItemName = itemName,
                ServerCode = serverCode,
                Quantity = quantity,
                MinimumGb = minimumGb,
                Note = note,
                Status = "open",
                CreatedAt = DateTimeOffset.UtcNow
            };

            db.SaleRequests.Add(row);
            await db.SaveChangesAsync();

            var traderIds = await db.Users.AsNoTracking()
                .Where(x => x.VerifiedTrader && x.AccountStatus == "active")
                .Select(x => x.Id)
                .ToListAsync();

            if (traderIds.Count > 0)
            {
                db.Notifications.AddRange(traderIds.Select(id => new AppNotification
                {
                    UserId = id,
                    Title = "Yeni item alım talebi",
                    Body = $"{row.ServerCode} • {row.ItemName} • minimum {row.MinimumGb:0.##} GB"
                }));
                await db.SaveChangesAsync();
            }

            return Results.Json(new { ok = true, request = row }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPost("/api/gb-trade/offers/{id:long}/accept", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var sellerUserId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(sellerUserId)) return Results.Unauthorized();

            var offer = await db.Offers.Include(x => x.SaleRequest).FirstOrDefaultAsync(x => x.Id == id);
            if (offer?.SaleRequest is null || offer.SaleRequest.UserId != sellerUserId || offer.SaleRequest.Status != "open")
                return Results.NotFound();

            await using var tx = await db.Database.BeginTransactionAsync();

            offer.SaleRequest.Status = "matched";
            var siblings = await db.Offers.Where(x => x.SaleRequestId == offer.SaleRequestId).ToListAsync();
            foreach (var sibling in siblings)
                sibling.Status = sibling.Id == offer.Id ? "accepted" : "declined";

            var deal = new Deal
            {
                SaleRequestId = offer.SaleRequestId,
                Flow = "kotakas_direct_buy",
                UserId = sellerUserId,
                TraderUserId = offer.TraderUserId,
                TraderName = offer.TraderName,
                GameCode = offer.SaleRequest.GameCode,
                ProductType = "item",
                CurrencyCode = "GB",
                ItemName = offer.SaleRequest.ItemName,
                ServerCode = offer.SaleRequest.ServerCode,
                Quantity = offer.SaleRequest.Quantity,
                UnitPriceGb = offer.PriceGb,
                PriceGb = offer.PriceGb,
                GbTryRate = 0m,
                GrossTry = 0m,
                EscrowTry = 0m,
                CommissionPercent = 0m,
                CommissionTry = 0m,
                SellerNetTry = 0m,
                Status = "awaiting_item_delivery",
                CreatedAt = DateTimeOffset.UtcNow
            };

            db.Deals.Add(deal);
            db.Notifications.Add(new AppNotification
            {
                UserId = offer.TraderUserId,
                Title = "Item teklifin kabul edildi",
                Body = $"{deal.ItemName} • {deal.PriceGb:0.##} GB • item teslimi bekleniyor."
            });
            db.Notifications.Add(new AppNotification
            {
                UserId = sellerUserId,
                Title = "KOTAKAS alım işlemi başladı",
                Body = $"{deal.ItemName} için {deal.PriceGb:0.##} GB teklif kabul edildi. Item teslim adımına geçebilirsin."
            });

            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();

        return app;
    }

    public sealed record GbSellRequestInput(string? ItemName, string? ServerCode, int Quantity, decimal MinimumGb, string? Note);
}
