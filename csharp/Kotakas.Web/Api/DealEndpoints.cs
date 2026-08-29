using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class DealEndpoints
{
    private static readonly Dictionary<string, string> Ready = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ITEM_HAZIR"] = "Item hazır, teslim için uygunum.",
        ["TESLIM_YERINDEYIM"] = "Teslim noktasındayım.",
        ["BEKLIYORUM"] = "Teslim için bekliyorum.",
        ["TESLIM_ALDIM"] = "Teslimatı aldım.",
        ["SORUN_VAR"] = "İşlemle ilgili sorun var, admin desteği istiyorum."
    };

    public static IEndpointRouteBuilder MapDealEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/deals", async (ClaimsPrincipal p, AppDbContext db) => Results.Ok(new
        {
            deals = await db.Deals.AsNoTracking()
                .Where(x => x.UserId == ApiHelpers.UserId(p) || x.TraderUserId == ApiHelpers.UserId(p))
                .OrderByDescending(x => x.Id).Take(200).ToListAsync()
        })).RequireAuthorization();

        app.MapGet("/api/deals/{id:long}/messages", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (deal is null || !ApiHelpers.DealAccess(deal, p)) return Results.NotFound();
            return Results.Ok(new
            {
                messages = await db.DealMessages.AsNoTracking().Where(x => x.DealId == id).OrderBy(x => x.Id).Take(200).ToListAsync(),
                ready = Ready
            });
        }).RequireAuthorization();

        app.MapPost("/api/deals/{id:long}/messages", async (long id, ClaimsPrincipal p, DealMessageInput input, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id);
            if (deal is null || !ApiHelpers.DealAccess(deal, p)) return Results.NotFound();
            if (!Ready.TryGetValue(input.Code ?? "", out var text)) return Results.BadRequest(new { error = "ready_message_only" });
            var uid = ApiHelpers.UserId(p);
            db.DealMessages.Add(new DealMessage { DealId = id, SenderUserId = uid, MessageCode = input.Code!.ToUpperInvariant(), MessageText = text });
            var otherUserId = deal.UserId == uid ? deal.TraderUserId : deal.UserId;
            db.Notifications.Add(new AppNotification { UserId = otherUserId, Title = "İşlem mesajı", Body = text });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        // Eski KOTAKAS akışı: normal kullanıcı satıcıdır, pazarcı alıcıdır.
        app.MapPost("/api/deals/{id:long}/delivered", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var sellerUserId = ApiHelpers.UserId(p);
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id && x.UserId == sellerUserId && x.Status == "funded");
            if (deal is null) return Results.NotFound();
            deal.Status = "seller_delivered";
            db.Notifications.Add(new AppNotification
            {
                UserId = deal.TraderUserId,
                Title = "Satıcı teslim bildirimi yaptı",
                Body = $"{deal.ItemName} teslim edildi olarak işaretlendi. Itemi aldıysan işlemi onayla."
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();

        app.MapPost("/api/deals/{id:long}/confirm", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var buyerUserId = ApiHelpers.UserId(p);
            await using var tx = await db.Database.BeginTransactionAsync();
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id && x.TraderUserId == buyerUserId && x.Status == "seller_delivered");
            if (deal is null || deal.EscrowTry <= 0) return Results.NotFound();

            var sellerWallet = await ApiHelpers.WalletFor(db, deal.UserId);
            var before = sellerWallet.BalanceTry;
            sellerWallet.BalanceTry += deal.SellerNetTry;
            sellerWallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger
            {
                UserId = deal.UserId,
                AmountTry = deal.SellerNetTry,
                BeforeTry = before,
                AfterTry = sellerWallet.BalanceTry,
                Type = "escrow_release",
                Reason = $"Anlaşma #{deal.Id} tamamlandı: {deal.ItemName}"
            });

            deal.EscrowTry = 0;
            deal.Status = "completed";
            deal.CompletedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification
            {
                UserId = deal.UserId,
                Title = "İşlem tamamlandı",
                Body = $"{deal.ItemName}: {deal.SellerNetTry:0.00} ₺ bakiyene aktarıldı. Komisyon {deal.CommissionTry:0.00} ₺."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();

        app.MapPost("/api/deals/{id:long}/cancel", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var sellerUserId = ApiHelpers.UserId(p);
            await using var tx = await db.Database.BeginTransactionAsync();
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id && x.UserId == sellerUserId && x.Status == "funded");
            if (deal is null || deal.EscrowTry <= 0) return Results.NotFound();

            var buyerWallet = await ApiHelpers.WalletFor(db, deal.TraderUserId);
            var before = buyerWallet.BalanceTry;
            buyerWallet.BalanceTry += deal.EscrowTry;
            buyerWallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger
            {
                UserId = deal.TraderUserId,
                AmountTry = deal.EscrowTry,
                BeforeTry = before,
                AfterTry = buyerWallet.BalanceTry,
                Type = "escrow_refund",
                Reason = $"Anlaşma #{deal.Id} satıcı tarafından iptal edildi"
            });
            var refund = deal.EscrowTry;
            deal.EscrowTry = 0;
            deal.Status = "cancelled";
            var request = await db.SaleRequests.FirstOrDefaultAsync(x => x.Id == deal.SaleRequestId);
            if (request is not null) request.Status = "cancelled";
            db.Notifications.Add(new AppNotification { UserId = deal.TraderUserId, Title = "İşlem iptal edildi", Body = $"{refund:0.00} ₺ emanet bakiyeden hesabına iade edildi." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();

        app.MapPost("/api/deals/{id:long}/dispute", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id);
            if (deal is null || !ApiHelpers.DealAccess(deal, p) || deal.Status is "completed" or "cancelled" or "disputed") return Results.NotFound();
            deal.Status = "disputed";
            db.SupportTickets.Add(new SupportTicket
            {
                UserId = ApiHelpers.UserId(p),
                Subject = $"Anlaşmazlık #{deal.Id} - {deal.ItemName}",
                Message = $"İşlem taraflarından biri anlaşmazlık açtı. Emanette {deal.EscrowTry:0.00} ₺ tutuluyor.",
                Priority = "high"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();
        return app;
    }
}

public record DealMessageInput(string? Code);
