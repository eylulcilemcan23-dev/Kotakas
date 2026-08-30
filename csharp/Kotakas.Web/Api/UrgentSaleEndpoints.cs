using System.Globalization;
using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class UrgentSaleEndpoints
{
    private const string Prefix = "[ACIL ITEM]";

    private static readonly Dictionary<string, string> AdminReady = new(StringComparer.OrdinalIgnoreCase)
    {
        ["SERVER1_GEL"] = "1. sunucuya gel. Alımı buradan yapacağız.",
        ["SERVER2_GEL"] = "2. sunucuya gel. Alımı buradan yapacağız.",
        ["MORADON_BANKA"] = "Moradon banka önüne gel.",
        ["MORADON_INN"] = "Moradon Inn Hostess yanına gel.",
        ["TRADE_HAZIR"] = "Alım için hazırız. Karakter adını kontrol edip trade atabilirsin.",
        ["BES_DK"] = "5 dakika içinde hazır ol, alımı tamamlayacağız."
    };

    private static readonly Dictionary<string, string> UserReady = new(StringComparer.OrdinalIgnoreCase)
    {
        ["GELIYORUM"] = "Geliyorum, kısa süre içinde orada olacağım.",
        ["HAZIRIM"] = "Hazırım, teslim için bekliyorum.",
        ["TRADE_ATTIM"] = "Trade attım / teslim için hazırım.",
        ["BEKLIYORUM"] = "Belirtilen yerde bekliyorum.",
        ["SORUN_VAR"] = "İşlemle ilgili sorun var, admin kontrolü istiyorum."
    };

    public static IEndpointRouteBuilder MapUrgentSaleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/urgent-sales", async (ClaimsPrincipal principal, UrgentSaleCreateInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var item = (input.ItemName ?? "").Trim();
            var server = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant();
            var note = (input.Note ?? "").Trim();
            var quantity = Math.Clamp(input.Quantity, 1, 100);
            var askGb = input.AskGb;

            if (item.Length < 2 || item.Length > 120 || server.Length < 2 || server.Length > 24 || askGb <= 0 ||
                note.Length > 400 || ApiHelpers.HasExternalContact(item + " " + note))
                return Results.BadRequest(new { error = "invalid_urgent_sale" });

            var duplicate = await db.SupportTickets.AsNoTracking()
                .AnyAsync(x => x.UserId == uid && x.Subject.StartsWith(Prefix) && x.Status != "closed");
            if (duplicate) return Results.Conflict(new { error = "urgent_sale_already_open" });

            var ticket = new SupportTicket
            {
                UserId = uid,
                Subject = $"{Prefix} {server} • {item}",
                Message = BuildPayload(item, server, quantity, askGb, note),
                Priority = "high",
                Status = "open",
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.SupportTickets.Add(ticket);

            var adminIds = await AdminIds(db);
            db.Notifications.AddRange(adminIds.Select(id => new AppNotification
            {
                UserId = id,
                Title = "⚡ Acil item satışı geldi",
                Body = $"{server} • {item} • kullanıcı beklentisi {askGb:0.##} GB"
            }));

            await db.SaveChangesAsync();
            return Results.Json(new { ok = true, sale = ToDto(ticket, Array.Empty<SupportReply>()) }, statusCode: 201);
        }).RequireAuthorization();

        app.MapGet("/api/urgent-sales/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var tickets = await db.SupportTickets.AsNoTracking()
                .Where(x => x.UserId == uid && x.Subject.StartsWith(Prefix))
                .OrderByDescending(x => x.Id)
                .Take(50)
                .ToListAsync();
            var ids = tickets.Select(x => x.Id).ToList();
            var replies = await db.SupportReplies.AsNoTracking()
                .Where(x => ids.Contains(x.TicketId))
                .OrderBy(x => x.Id)
                .ToListAsync();
            return Results.Ok(new
            {
                sales = tickets.Select(x => ToDto(x, replies.Where(r => r.TicketId == x.Id))),
                ready = UserReady
            });
        }).RequireAuthorization();

        app.MapPost("/api/urgent-sales/{id:long}/decision", async (long id, ClaimsPrincipal principal, UrgentSaleDecisionInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid && x.Subject.StartsWith(Prefix) && x.Status != "closed");
            if (ticket is null) return Results.NotFound();
            var replies = await db.SupportReplies.AsNoTracking().Where(x => x.TicketId == id).OrderByDescending(x => x.Id).ToListAsync();
            var latestOffer = LatestOffer(replies);
            if (latestOffer is null) return Results.BadRequest(new { error = "urgent_sale_no_offer" });

            var action = (input.Action ?? "").Trim().ToLowerInvariant();
            if (action is not ("accept" or "reject")) return Results.BadRequest(new { error = "invalid_urgent_sale_decision" });

            var accepted = action == "accept";
            db.SupportReplies.Add(new SupportReply
            {
                TicketId = id,
                SenderUserId = uid,
                SenderRole = "user",
                Message = accepted ? $"[KABUL] {latestOffer.Value:0.##} GB teklifini kabul ediyorum." : $"[RED] {latestOffer.Value:0.##} GB teklifini kabul etmiyorum."
            });
            ticket.Status = accepted ? "in_progress" : "open";
            ticket.UpdatedAt = DateTimeOffset.UtcNow;

            var adminIds = await AdminIds(db);
            db.Notifications.AddRange(adminIds.Select(adminId => new AppNotification
            {
                UserId = adminId,
                Title = accepted ? "⚡ Acil item teklifin kabul edildi" : "Acil item teklifi reddedildi",
                Body = $"Talep #{ticket.Id} • {ticket.Subject.Replace(Prefix, "").Trim()}"
            }));
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, accepted, status = ticket.Status });
        }).RequireAuthorization();

        app.MapPost("/api/urgent-sales/{id:long}/message", async (long id, ClaimsPrincipal principal, UrgentSaleMessageInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid && x.Subject.StartsWith(Prefix) && x.Status == "in_progress");
            if (ticket is null) return Results.NotFound();
            if (!UserReady.TryGetValue((input.Code ?? "").Trim(), out var text)) return Results.BadRequest(new { error = "urgent_sale_ready_message_only" });

            db.SupportReplies.Add(new SupportReply { TicketId = id, SenderUserId = uid, SenderRole = "user", Message = $"[HAZIR:{input.Code!.ToUpperInvariant()}] {text}" });
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            var adminIds = await AdminIds(db);
            db.Notifications.AddRange(adminIds.Select(adminId => new AppNotification { UserId = adminId, Title = "Acil item işlem mesajı", Body = $"Talep #{id} • {text}" }));
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        var admin = app.MapGroup("/api/admin/urgent-sales")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        admin.MapGet("/", async (AppDbContext db) =>
        {
            var tickets = await db.SupportTickets.AsNoTracking()
                .Where(x => x.Subject.StartsWith(Prefix))
                .OrderByDescending(x => x.Id)
                .Take(200)
                .ToListAsync();
            var ids = tickets.Select(x => x.Id).ToList();
            var replies = await db.SupportReplies.AsNoTracking().Where(x => ids.Contains(x.TicketId)).OrderBy(x => x.Id).ToListAsync();
            var userIds = tickets.Select(x => x.UserId).Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.Email });
            return Results.Ok(new
            {
                sales = tickets.Select(x =>
                {
                    var dto = ToDto(x, replies.Where(r => r.TicketId == x.Id));
                    return new { sale = dto, userName = users.TryGetValue(x.UserId, out var u) ? u.DisplayName : "Kullanıcı", userEmail = users.TryGetValue(x.UserId, out var e) ? e.Email : null };
                }),
                ready = AdminReady
            });
        });

        admin.MapPost("/{id:long}/offer", async (long id, ClaimsPrincipal principal, UrgentSaleOfferInput input, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            if (input.PriceGb <= 0) return Results.BadRequest(new { error = "invalid_price" });
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.Subject.StartsWith(Prefix) && x.Status != "closed");
            if (ticket is null) return Results.NotFound();
            db.SupportReplies.Add(new SupportReply
            {
                TicketId = id,
                SenderUserId = ApiHelpers.UserId(principal),
                SenderRole = "admin",
                Message = $"[TEKLIF] {input.PriceGb.ToString("0.####", CultureInfo.InvariantCulture)} GB"
            });
            ticket.Status = "in_progress";
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification { UserId = ticket.UserId, Title = "⚡ KOTAKAS acil alım teklifi verdi", Body = $"Talep #{id} için teklif: {input.PriceGb:0.##} GB. Kabul veya reddet." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, priceGb = input.PriceGb });
        });

        admin.MapPost("/{id:long}/message", async (long id, ClaimsPrincipal principal, UrgentSaleMessageInput input, AppDbContext db) =>
        {
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.Subject.StartsWith(Prefix) && x.Status == "in_progress");
            if (ticket is null) return Results.NotFound();
            if (!AdminReady.TryGetValue((input.Code ?? "").Trim(), out var baseText)) return Results.BadRequest(new { error = "urgent_sale_ready_message_only" });
            var payload = ParsePayload(ticket.Message);
            var text = baseText.StartsWith("1.") || baseText.StartsWith("2.") ? $"{payload.ServerCode} {baseText}" : baseText;
            db.SupportReplies.Add(new SupportReply { TicketId = id, SenderUserId = ApiHelpers.UserId(principal), SenderRole = "admin", Message = $"[HAZIR:{input.Code!.ToUpperInvariant()}] {text}" });
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification { UserId = ticket.UserId, Title = "Acil item işlem mesajı", Body = text });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, text });
        });

        admin.MapPost("/{id:long}/complete", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.Subject.StartsWith(Prefix) && x.Status != "closed");
            if (ticket is null) return Results.NotFound();
            db.SupportReplies.Add(new SupportReply { TicketId = id, SenderUserId = ApiHelpers.UserId(principal), SenderRole = "admin", Message = "[TAMAMLANDI] Acil item alımı tamamlandı." });
            ticket.Status = "closed";
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification { UserId = ticket.UserId, Title = "Acil item alımı tamamlandı", Body = $"Talep #{id} tamamlandı." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        });

        return app;
    }

    private static async Task<List<string>> AdminIds(AppDbContext db)
    {
        var roleIds = await db.Roles.AsNoTracking()
            .Where(x => x.Name == "admin_owner" || x.Name == "admin_full" || x.Name == "admin_limited")
            .Select(x => x.Id).ToListAsync();
        return await db.UserRoles.AsNoTracking().Where(x => roleIds.Contains(x.RoleId)).Select(x => x.UserId).Distinct().ToListAsync();
    }

    private static string BuildPayload(string item, string server, int quantity, decimal askGb, string note) =>
        $"Item: {item}\nServer: {server}\nAdet: {quantity}\nİstenen: {askGb.ToString("0.####", CultureInfo.InvariantCulture)} GB\nNot: {note}";

    private static UrgentPayload ParsePayload(string message)
    {
        string Read(string label) => (message ?? "").Split('\n').FirstOrDefault(x => x.StartsWith(label, StringComparison.OrdinalIgnoreCase))?[label.Length..].Trim() ?? "";
        var item = Read("Item:");
        var server = Read("Server:");
        _ = int.TryParse(Read("Adet:"), out var quantity);
        var raw = Read("İstenen:").Replace("GB", "", StringComparison.OrdinalIgnoreCase).Trim();
        _ = decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var askGb);
        return new UrgentPayload(item, server, Math.Max(1, quantity), askGb, Read("Not:"));
    }

    private static decimal? LatestOffer(IEnumerable<SupportReply> replies)
    {
        foreach (var reply in replies.OrderByDescending(x => x.Id))
        {
            if (!reply.Message.StartsWith("[TEKLIF]", StringComparison.OrdinalIgnoreCase)) continue;
            var raw = reply.Message[8..].Replace("GB", "", StringComparison.OrdinalIgnoreCase).Trim();
            if (decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var value)) return value;
        }
        return null;
    }

    private static object ToDto(SupportTicket ticket, IEnumerable<SupportReply> replyRows)
    {
        var replies = replyRows.OrderBy(x => x.Id).ToList();
        var payload = ParsePayload(ticket.Message);
        var latestOffer = LatestOffer(replies);
        var accepted = replies.LastOrDefault(x => x.Message.StartsWith("[KABUL]", StringComparison.OrdinalIgnoreCase)) is not null;
        var rejectedAfterOffer = replies.LastOrDefault(x => x.Message.StartsWith("[RED]", StringComparison.OrdinalIgnoreCase)) is not null && !accepted;
        return new
        {
            id = ticket.Id,
            ticket.UserId,
            payload.ItemName,
            payload.ServerCode,
            payload.Quantity,
            payload.AskGb,
            payload.Note,
            ticket.Status,
            ticket.CreatedAt,
            ticket.UpdatedAt,
            latestOfferGb = latestOffer,
            accepted,
            rejected = rejectedAfterOffer,
            replies = replies.Select(x => new { x.Id, x.SenderRole, x.Message, x.CreatedAt })
        };
    }

    private sealed record UrgentPayload(string ItemName, string ServerCode, int Quantity, decimal AskGb, string Note);
}

public record UrgentSaleCreateInput(string? ItemName, string? ServerCode, int Quantity, decimal AskGb, string? Note);
public record UrgentSaleDecisionInput(string? Action);
public record UrgentSaleOfferInput(decimal PriceGb);
public record UrgentSaleMessageInput(string? Code);
