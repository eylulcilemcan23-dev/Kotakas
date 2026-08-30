using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class SupportCenterEndpoints
{
    public static IEndpointRouteBuilder MapSupportCenterEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/support/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var tickets = await db.SupportTickets.AsNoTracking()
                .Where(x => x.UserId == uid && !x.Subject.StartsWith("[ACIL ITEM]"))
                .OrderByDescending(x => x.Id)
                .Take(100)
                .ToListAsync();
            var ids = tickets.Select(x => x.Id).ToList();
            var replies = await db.SupportReplies.AsNoTracking()
                .Where(x => ids.Contains(x.TicketId))
                .OrderBy(x => x.Id)
                .ToListAsync();
            return Results.Ok(new
            {
                tickets = tickets.Select(t => TicketDto(t, replies.Where(r => r.TicketId == t.Id)))
            });
        }).RequireAuthorization();

        app.MapPost("/api/support/{id:long}/reply", async (long id, ClaimsPrincipal principal, SupportReplyInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid);
            if (ticket is null) return Results.NotFound();
            if (ticket.Subject.StartsWith("[ACIL ITEM]", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "urgent_sale_ready_message_only" });
            var message = (input.Message ?? "").Trim();
            if (message.Length < 2 || message.Length > 1000) return Results.BadRequest(new { error = "invalid_support_reply" });

            db.SupportReplies.Add(new SupportReply
            {
                TicketId = id,
                SenderUserId = uid,
                SenderRole = "user",
                Message = message
            });
            if (ticket.Status == "closed") ticket.Status = "open";
            ticket.UpdatedAt = DateTimeOffset.UtcNow;

            var adminRoleIds = await db.Roles.AsNoTracking()
                .Where(x => x.Name == "admin_owner" || x.Name == "admin_full" || x.Name == "admin_limited")
                .Select(x => x.Id)
                .ToListAsync();
            var adminIds = await db.UserRoles.AsNoTracking()
                .Where(x => adminRoleIds.Contains(x.RoleId))
                .Select(x => x.UserId)
                .Distinct()
                .ToListAsync();
            db.Notifications.AddRange(adminIds.Select(adminId => new AppNotification
            {
                UserId = adminId,
                Title = "Destek kaydına yeni kullanıcı mesajı",
                Body = $"Destek #{ticket.Id} • {ticket.Subject}"
            }));
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = ticket.Status, updatedAt = ticket.UpdatedAt });
        }).RequireAuthorization();

        var admin = app.MapGroup("/api/admin/support-center")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        admin.MapGet("/tickets", async (string? q, string? status, string? priority, AppDbContext db) =>
        {
            var query = db.SupportTickets.AsNoTracking()
                .Where(x => !x.Subject.StartsWith("[ACIL ITEM]"))
                .AsQueryable();
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == status);
            if (!string.IsNullOrWhiteSpace(priority) && !priority.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Priority == priority);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Subject.Contains(term) || x.Message.Contains(term) || x.Id.ToString().Contains(term));
            }
            var tickets = await query.OrderByDescending(x => x.Id).Take(300).ToListAsync();
            var userIds = tickets.Select(x => x.UserId).Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.Email });
            var ticketIds = tickets.Select(x => x.Id).ToList();
            var replyCounts = await db.SupportReplies.AsNoTracking()
                .Where(x => ticketIds.Contains(x.TicketId))
                .GroupBy(x => x.TicketId)
                .Select(g => new { ticketId = g.Key, count = g.Count() })
                .ToDictionaryAsync(x => x.ticketId, x => x.count);

            return Results.Ok(new
            {
                tickets = tickets.Select(t => new
                {
                    t.Id,
                    t.Subject,
                    t.Status,
                    t.Priority,
                    t.CreatedAt,
                    t.UpdatedAt,
                    t.UserId,
                    userName = users.TryGetValue(t.UserId, out var u) ? u.DisplayName : "Kullanıcı",
                    userEmail = users.TryGetValue(t.UserId, out var e) ? e.Email : null,
                    replyCount = replyCounts.TryGetValue(t.Id, out var c) ? c : 0
                })
            });
        });

        admin.MapGet("/tickets/{id:long}", async (long id, AppDbContext db) =>
        {
            var ticket = await db.SupportTickets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (ticket is null) return Results.NotFound();
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ticket.UserId);
            var replies = await db.SupportReplies.AsNoTracking().Where(x => x.TicketId == id).OrderBy(x => x.Id).ToListAsync();
            return Results.Ok(new
            {
                ticket = new
                {
                    ticket.Id,
                    ticket.Subject,
                    ticket.Message,
                    ticket.Status,
                    ticket.Priority,
                    ticket.CreatedAt,
                    ticket.UpdatedAt,
                    ticket.UserId,
                    userName = user?.DisplayName ?? "Kullanıcı",
                    userEmail = user?.Email,
                    replies = replies.Select(r => new { r.Id, r.SenderUserId, r.SenderRole, r.Message, r.CreatedAt })
                }
            });
        });

        admin.MapPost("/tickets/{id:long}/reply", async (long id, ClaimsPrincipal principal, AdminSupportReplyInput input, AppDbContext db) =>
        {
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (ticket is null) return Results.NotFound();
            if (ticket.Subject.StartsWith("[ACIL ITEM]", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "urgent_sale_ready_message_only" });
            var message = (input.Message ?? "").Trim();
            if (message.Length < 2 || message.Length > 1000) return Results.BadRequest(new { error = "invalid_support_reply" });

            db.SupportReplies.Add(new SupportReply
            {
                TicketId = id,
                SenderUserId = ApiHelpers.UserId(principal),
                SenderRole = "admin",
                Message = message
            });
            ticket.Status = input.Close ? "closed" : "in_progress";
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            db.Notifications.Add(new AppNotification
            {
                UserId = ticket.UserId,
                Title = input.Close ? "Destek kaydın yanıtlandı ve kapatıldı" : "Destek kaydına yanıt geldi",
                Body = $"Destek #{ticket.Id} • {ticket.Subject}"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = ticket.Status, updatedAt = ticket.UpdatedAt });
        });

        admin.MapPatch("/tickets/{id:long}/status", async (long id, SupportCenterStatusInput input, AppDbContext db) =>
        {
            if (input.Status is not ("open" or "in_progress" or "closed")) return Results.BadRequest(new { error = "invalid_support_status" });
            var ticket = await db.SupportTickets.FirstOrDefaultAsync(x => x.Id == id);
            if (ticket is null) return Results.NotFound();
            ticket.Status = input.Status;
            ticket.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = ticket.Status });
        });

        return app;
    }

    private static object TicketDto(SupportTicket t, IEnumerable<SupportReply> replies) => new
    {
        t.Id,
        t.Subject,
        t.Message,
        t.Status,
        t.Priority,
        t.CreatedAt,
        t.UpdatedAt,
        replies = replies.Select(r => new { r.Id, r.SenderRole, r.Message, r.CreatedAt })
    };
}

public record SupportReplyInput(string? Message);
public record AdminSupportReplyInput(string? Message, bool Close = false);
public record SupportCenterStatusInput(string Status);