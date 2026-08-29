using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class VerificationEndpoints
{
    public static IEndpointRouteBuilder MapVerificationEndpoints(this IEndpointRouteBuilder app)
    {
        var user = app.MapGroup("/api/verification").RequireAuthorization();

        user.MapGet("/me", async (ClaimsPrincipal principal, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var current = await users.GetUserAsync(principal);
            if (current is null) return Results.Unauthorized();
            var last = await db.VerificationRequests.AsNoTracking()
                .Where(x => x.UserId == current.Id && x.Kind == "account")
                .OrderByDescending(x => x.Id)
                .FirstOrDefaultAsync();
            return Results.Ok(new
            {
                userVerified = current.UserVerified,
                userVerifiedAt = current.UserVerifiedAt,
                verifiedTrader = current.VerifiedTrader,
                request = last is null ? null : new { last.Id, last.Status, last.Note, last.AdminNote, last.CreatedAt, last.DecidedAt }
            });
        });

        user.MapPost("/account-request", async (VerificationRequestInput input, ClaimsPrincipal principal, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var current = await users.GetUserAsync(principal);
            if (current is null) return Results.Unauthorized();
            if (current.UserVerified) return Results.Conflict(new { error = "account_already_verified" });
            if (await db.VerificationRequests.AnyAsync(x => x.UserId == current.Id && x.Kind == "account" && x.Status == "pending"))
                return Results.Conflict(new { error = "verification_already_pending" });
            var note = (input.Note ?? "").Trim();
            if (note.Length > 300 || ApiHelpers.HasExternalContact(note))
                return Results.BadRequest(new { error = "invalid_verification_note" });

            var row = new VerificationRequest { UserId = current.Id, Kind = "account", Note = note };
            db.VerificationRequests.Add(row);
            var admins = await users.GetUsersInRoleAsync("admin_owner");
            var fullAdmins = await users.GetUsersInRoleAsync("admin_full");
            foreach (var admin in admins.Concat(fullAdmins).DistinctBy(x => x.Id))
                db.Notifications.Add(new AppNotification { UserId = admin.Id, Title = "Yeni hesap doğrulama talebi", Body = $"{current.DisplayName} hesap doğrulaması istiyor." });
            await db.SaveChangesAsync();
            return Results.Json(new { ok = true, request = row }, statusCode: 201);
        });

        var admin = app.MapGroup("/api/admin/verifications")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        admin.MapGet("/", async (string? status, AppDbContext db) =>
        {
            var q = db.VerificationRequests.AsNoTracking().Where(x => x.Kind == "account");
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                q = q.Where(x => x.Status == status.ToLower());
            var rows = await q.OrderByDescending(x => x.Id).Take(500).ToListAsync();
            var ids = rows.Select(x => x.UserId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.Email, x.UserVerified });
            return Results.Ok(new
            {
                requests = rows.Select(x => new
                {
                    x.Id,
                    x.UserId,
                    x.Status,
                    x.Note,
                    x.AdminNote,
                    x.CreatedAt,
                    x.DecidedAt,
                    user = names.TryGetValue(x.UserId, out var u) ? u : null
                })
            });
        });

        admin.MapPost("/{id:long}/decision", async (long id, VerificationDecisionInput input, ClaimsPrincipal principal, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            if (input.Decision is not ("approved" or "rejected")) return Results.BadRequest(new { error = "invalid_decision" });
            var row = await db.VerificationRequests.FirstOrDefaultAsync(x => x.Id == id && x.Kind == "account" && x.Status == "pending");
            if (row is null) return Results.NotFound();
            var target = await users.FindByIdAsync(row.UserId);
            if (target is null) return Results.NotFound();
            var note = (input.AdminNote ?? "").Trim();
            if (note.Length > 500 || ApiHelpers.HasExternalContact(note)) return Results.BadRequest(new { error = "invalid_admin_note" });

            row.Status = input.Decision;
            row.AdminNote = note;
            row.DecidedAt = DateTimeOffset.UtcNow;
            row.DecidedByUserId = ApiHelpers.UserId(principal);
            if (input.Decision == "approved")
            {
                target.UserVerified = true;
                target.UserVerifiedAt = DateTimeOffset.UtcNow;
                target.UserVerifiedByUserId = ApiHelpers.UserId(principal);
                await users.UpdateAsync(target);
            }
            db.Notifications.Add(new AppNotification
            {
                UserId = target.Id,
                Title = input.Decision == "approved" ? "Hesabın doğrulandı" : "Hesap doğrulama talebin sonuçlandı",
                Body = input.Decision == "approved" ? "KOTAKAS hesap doğrulaman onaylandı. Profilinde doğrulama rozeti görünecek." : (string.IsNullOrWhiteSpace(note) ? "Doğrulama talebin onaylanmadı." : note)
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = row.Status, userVerified = target.UserVerified });
        });

        var full = app.MapGroup("/api/admin/verifications")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));
        full.MapPost("/users/{id}/revoke", async (string id, ClaimsPrincipal principal, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var target = await users.FindByIdAsync(id);
            if (target is null) return Results.NotFound();
            target.UserVerified = false;
            target.UserVerifiedAt = null;
            target.UserVerifiedByUserId = null;
            await users.UpdateAsync(target);
            db.Notifications.Add(new AppNotification { UserId = target.Id, Title = "Hesap doğrulaması kaldırıldı", Body = "Hesap doğrulama rozetin yönetim tarafından kaldırıldı. Destekten bilgi alabilirsin." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, userVerified = false, changedBy = ApiHelpers.UserId(principal) });
        });

        return app;
    }
}

public record VerificationRequestInput(string? Note);
public record VerificationDecisionInput(string Decision, string? AdminNote);
