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
        app.MapGet("/api/deals", async (ClaimsPrincipal p, AppDbContext db) => Results.Ok(new { deals = await db.Deals.AsNoTracking().Where(x => x.UserId == ApiHelpers.UserId(p) || x.TraderUserId == ApiHelpers.UserId(p)).OrderByDescending(x => x.Id).Take(200).ToListAsync() })).RequireAuthorization();
        app.MapGet("/api/deals/{id:long}/messages", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id); if (deal is null || !ApiHelpers.DealAccess(deal, p)) return Results.NotFound();
            return Results.Ok(new { messages = await db.DealMessages.AsNoTracking().Where(x => x.DealId == id).OrderBy(x => x.Id).Take(200).ToListAsync(), ready = Ready });
        }).RequireAuthorization();
        app.MapPost("/api/deals/{id:long}/messages", async (long id, ClaimsPrincipal p, DealMessageInput input, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id); if (deal is null || !ApiHelpers.DealAccess(deal, p)) return Results.NotFound();
            if (!Ready.TryGetValue(input.Code ?? "", out var text)) return Results.BadRequest(new { error = "ready_message_only" });
            var uid = ApiHelpers.UserId(p); db.DealMessages.Add(new DealMessage { DealId = id, SenderUserId = uid, MessageCode = input.Code!.ToUpperInvariant(), MessageText = text });
            db.Notifications.Add(new AppNotification { UserId = deal.UserId == uid ? deal.TraderUserId : deal.UserId, Title = "İşlem mesajı", Body = text });
            await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
        }).RequireAuthorization();
        app.MapPost("/api/deals/{id:long}/delivered", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id && x.TraderUserId == ApiHelpers.UserId(p) && x.Status == "pending_delivery"); if (deal is null) return Results.NotFound();
            deal.Status = "seller_delivered"; db.Notifications.Add(new AppNotification { UserId = deal.UserId, Title = "Teslim bildirimi", Body = $"{deal.ItemName} teslim edildi olarak işaretlendi." }); await db.SaveChangesAsync(); return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();
        app.MapPost("/api/deals/{id:long}/confirm", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id && x.UserId == ApiHelpers.UserId(p) && x.Status == "seller_delivered"); if (deal is null) return Results.NotFound();
            deal.Status = "completed"; db.Notifications.Add(new AppNotification { UserId = deal.TraderUserId, Title = "İşlem tamamlandı", Body = $"{deal.ItemName} teslimatı onaylandı." }); await db.SaveChangesAsync(); return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();
        app.MapPost("/api/deals/{id:long}/dispute", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var deal = await db.Deals.FirstOrDefaultAsync(x => x.Id == id); if (deal is null || !ApiHelpers.DealAccess(deal, p) || deal.Status == "completed") return Results.NotFound();
            deal.Status = "disputed"; db.SupportTickets.Add(new SupportTicket { UserId = ApiHelpers.UserId(p), Subject = $"Anlaşmazlık #{deal.Id} - {deal.ItemName}", Message = "İşlem taraflarından biri anlaşmazlık açtı.", Priority = "high" }); await db.SaveChangesAsync(); return Results.Ok(new { ok = true, deal });
        }).RequireAuthorization();
        return app;
    }
}
public record DealMessageInput(string? Code);
