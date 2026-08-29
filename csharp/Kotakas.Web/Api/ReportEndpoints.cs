using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ReportEndpoints
{
    private static readonly HashSet<string> TargetTypes = new(StringComparer.OrdinalIgnoreCase)
    { "listing", "trader", "sale_request", "review", "deal", "user" };
    private static readonly HashSet<string> Reasons = new(StringComparer.OrdinalIgnoreCase)
    { "scam", "contact_bypass", "wrong_listing", "harassment", "fake_information", "other" };

    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var reports = app.MapGroup("/api/reports").RequireAuthorization();

        reports.MapPost("/", async (ClaimsPrincipal principal, CreateReportInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var type = (input.TargetType ?? "").Trim().ToLowerInvariant();
            var targetId = (input.TargetId ?? "").Trim();
            var reason = (input.ReasonCode ?? "other").Trim().ToLowerInvariant();
            var details = (input.Details ?? "").Trim();

            if (!TargetTypes.Contains(type) || targetId.Length == 0) return Results.BadRequest(new { error = "invalid_report_target" });
            if (!Reasons.Contains(reason)) return Results.BadRequest(new { error = "invalid_report_reason" });
            if (details.Length > 500) return Results.BadRequest(new { error = "report_details_too_long" });
            if (!await TargetExists(type, targetId, uid, db)) return Results.NotFound();
            if ((type is "user" or "trader") && targetId == uid) return Results.BadRequest(new { error = "cannot_report_self" });

            var duplicate = await db.UserReports.AnyAsync(x => x.ReporterUserId == uid && x.TargetType == type && x.TargetId == targetId && (x.Status == "open" || x.Status == "in_review"));
            if (duplicate) return Results.Conflict(new { error = "report_already_open" });

            var row = new UserReport
            {
                ReporterUserId = uid,
                TargetType = type,
                TargetId = targetId,
                ReasonCode = reason,
                Details = details,
                Status = "open"
            };
            db.UserReports.Add(row);

            var adminRoleIds = await db.Roles.AsNoTracking().Where(x => x.Name != null && x.Name.StartsWith("admin_")).Select(x => x.Id).ToListAsync();
            var adminIds = await db.UserRoles.AsNoTracking().Where(x => adminRoleIds.Contains(x.RoleId)).Select(x => x.UserId).Distinct().ToListAsync();
            db.Notifications.AddRange(adminIds.Select(id => new AppNotification
            {
                UserId = id,
                Title = "Yeni kullanıcı şikâyeti",
                Body = $"{type} #{targetId} • {reason}"
            }));
            await db.SaveChangesAsync();
            return Results.Json(new { ok = true, report = row }, statusCode: 201);
        });

        reports.MapGet("/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var rows = await db.UserReports.AsNoTracking().Where(x => x.ReporterUserId == uid).OrderByDescending(x => x.Id).Take(100).ToListAsync();
            return Results.Ok(new { reports = rows });
        });

        var admin = app.MapGroup("/api/admin/reports")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        admin.MapGet("/", async (string? status, string? type, string? reason, string? q, AppDbContext db) =>
        {
            var query = db.UserReports.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase)) query = query.Where(x => x.Status == status.ToLower());
            if (!string.IsNullOrWhiteSpace(type) && !type.Equals("all", StringComparison.OrdinalIgnoreCase)) query = query.Where(x => x.TargetType == type.ToLower());
            if (!string.IsNullOrWhiteSpace(reason) && !reason.Equals("all", StringComparison.OrdinalIgnoreCase)) query = query.Where(x => x.ReasonCode == reason.ToLower());
            if (!string.IsNullOrWhiteSpace(q))
            {
                var text = q.Trim();
                query = query.Where(x => x.TargetId.Contains(text) || x.Details.Contains(text) || x.ReasonCode.Contains(text));
            }
            var rows = await query.OrderByDescending(x => x.Id).Take(300).ToListAsync();
            var reporterIds = rows.Select(x => x.ReporterUserId).Distinct().ToList();
            var reporterNames = await db.Users.AsNoTracking().Where(x => reporterIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName);
            return Results.Ok(new
            {
                reports = rows.Select(x => new
                {
                    x.Id,
                    x.ReporterUserId,
                    reporter = reporterNames.TryGetValue(x.ReporterUserId, out var name) ? name : "Kullanıcı",
                    x.TargetType,
                    x.TargetId,
                    x.ReasonCode,
                    x.Details,
                    x.Status,
                    x.AdminNote,
                    x.ResolvedByUserId,
                    x.CreatedAt,
                    x.UpdatedAt
                })
            });
        });

        admin.MapPatch("/{id:long}", async (long id, ClaimsPrincipal principal, UpdateReportInput input, AppDbContext db) =>
        {
            var row = await db.UserReports.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            var status = (input.Status ?? "").Trim().ToLowerInvariant();
            if (status is not ("open" or "in_review" or "resolved" or "dismissed")) return Results.BadRequest(new { error = "invalid_report_status" });
            var note = (input.AdminNote ?? "").Trim();
            if (note.Length > 500) return Results.BadRequest(new { error = "admin_note_too_long" });
            row.Status = status;
            row.AdminNote = note;
            row.UpdatedAt = DateTimeOffset.UtcNow;
            row.ResolvedByUserId = status is "resolved" or "dismissed" ? ApiHelpers.UserId(principal) : null;
            db.Notifications.Add(new AppNotification
            {
                UserId = row.ReporterUserId,
                Title = status == "resolved" ? "Şikâyetin sonuçlandırıldı" : status == "dismissed" ? "Şikâyetin incelendi" : "Şikâyetin incelemeye alındı",
                Body = $"Şikâyet #{row.Id} • durum: {status}"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, report = row });
        });

        return app;
    }

    private static async Task<bool> TargetExists(string type, string targetId, string reporterId, AppDbContext db)
    {
        switch (type)
        {
            case "listing":
                return long.TryParse(targetId, out var listingId) && await db.Listings.AnyAsync(x => x.Id == listingId);
            case "sale_request":
                return long.TryParse(targetId, out var requestId) && await db.SaleRequests.AnyAsync(x => x.Id == requestId);
            case "review":
                return long.TryParse(targetId, out var reviewId) && await db.TraderReviews.AnyAsync(x => x.Id == reviewId);
            case "deal":
                if (!long.TryParse(targetId, out var dealId)) return false;
                return await db.Deals.AnyAsync(x => x.Id == dealId && (x.UserId == reporterId || x.TraderUserId == reporterId));
            case "trader":
                return await db.Users.AnyAsync(x => x.Id == targetId && x.VerifiedTrader);
            case "user":
                return await db.Users.AnyAsync(x => x.Id == targetId);
            default:
                return false;
        }
    }
}

public record CreateReportInput(string? TargetType, string? TargetId, string? ReasonCode, string? Details);
public record UpdateReportInput(string? Status, string? AdminNote);
