using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AdminRiskEndpoints
{
    public static IEndpointRouteBuilder MapAdminRiskEndpoints(this IEndpointRouteBuilder app)
    {
        var risk = app.MapGroup("/api/admin/risk")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        risk.MapGet("/summary", async (AppDbContext db) =>
        {
            var active = await db.RiskSignals.AsNoTracking()
                .Where(x => x.Status == "open" || x.Status == "reviewing")
                .ToListAsync();
            var wallets = await db.Wallets.AsNoTracking().Select(x => x.BalanceTry).ToListAsync();
            var deals = await db.Deals.AsNoTracking()
                .Where(x => x.EscrowTry != 0 && x.Status != "completed" && x.Status != "refunded")
                .Select(x => x.EscrowTry).ToListAsync();
            var lastScan = await db.SiteSettings.AsNoTracking()
                .Where(x => x.Key == "risk_last_scan_at")
                .Select(x => x.Value)
                .FirstOrDefaultAsync();

            return Results.Ok(new
            {
                provider = db.Database.IsNpgsql() ? "PostgreSQL" : db.Database.IsSqlite() ? "SQLite" : db.Database.ProviderName,
                open = active.Count(x => x.Status == "open"),
                reviewing = active.Count(x => x.Status == "reviewing"),
                critical = active.Count(x => x.Severity == "critical"),
                high = active.Count(x => x.Severity == "high"),
                medium = active.Count(x => x.Severity == "medium"),
                walletTotalTry = wallets.Sum(),
                activeEscrowTry = deals.Sum(),
                lastScanAt = lastScan,
                recent = active.OrderByDescending(x => x.LastDetectedAt).Take(8).Select(x => new
                {
                    x.Id,
                    x.Code,
                    x.Severity,
                    x.Status,
                    x.Title,
                    x.SubjectUserId,
                    x.AmountTry,
                    x.LastDetectedAt
                })
            });
        });

        risk.MapGet("/signals", async (string? status, string? severity, string? code, string? userId, int? take, AppDbContext db) =>
        {
            var limit = Math.Clamp(take ?? 200, 1, 1000);
            var q = db.RiskSignals.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                q = q.Where(x => x.Status == status);
            if (!string.IsNullOrWhiteSpace(severity) && !severity.Equals("all", StringComparison.OrdinalIgnoreCase))
                q = q.Where(x => x.Severity == severity);
            if (!string.IsNullOrWhiteSpace(code)) q = q.Where(x => x.Code == code);
            if (!string.IsNullOrWhiteSpace(userId)) q = q.Where(x => x.SubjectUserId == userId);

            var rows = await q.OrderByDescending(x => x.LastDetectedAt).Take(limit).ToListAsync();
            var userIds = rows.Where(x => !string.IsNullOrWhiteSpace(x.SubjectUserId)).Select(x => x.SubjectUserId!).Distinct().ToList();
            var users = userIds.Count == 0
                ? new Dictionary<string, object>()
                : (await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).Select(x => new { x.Id, x.DisplayName, x.Email }).ToListAsync())
                    .ToDictionary(x => x.Id, x => (object)new { x.DisplayName, x.Email });

            return Results.Ok(new
            {
                signals = rows.Select(x => new
                {
                    x.Id,
                    x.Fingerprint,
                    x.Code,
                    x.Severity,
                    x.Status,
                    x.SubjectUserId,
                    user = x.SubjectUserId is not null && users.TryGetValue(x.SubjectUserId, out var u) ? u : null,
                    x.DealId,
                    x.WalletLedgerId,
                    x.AmountTry,
                    x.Title,
                    x.Details,
                    x.FirstDetectedAt,
                    x.LastDetectedAt,
                    x.ReviewedAt,
                    x.ReviewedByUserId,
                    x.ResolutionNote
                })
            });
        });

        risk.MapPost("/scan", async (RiskDetectionService scanner, CancellationToken cancellationToken) =>
        {
            var result = await scanner.ScanNowAsync(cancellationToken);
            return result.Completed ? Results.Ok(result) : Results.Json(result, statusCode: 409);
        });

        risk.MapPatch("/signals/{id:long}", async (long id, RiskSignalDecisionInput input, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var status = (input.Status ?? "").Trim().ToLowerInvariant();
            if (status is not ("open" or "reviewing" or "resolved" or "dismissed"))
                return Results.BadRequest(new { error = "invalid_risk_status" });
            var row = await db.RiskSignals.FindAsync(id);
            if (row is null) return Results.NotFound();
            var note = (input.Note ?? "").Trim();
            if (note.Length > 1000) note = note[..1000];
            row.Status = status;
            row.ReviewedAt = DateTimeOffset.UtcNow;
            row.ReviewedByUserId = ApiHelpers.UserId(principal);
            row.ResolutionNote = note;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, row.Id, row.Status });
        });

        return app;
    }
}

public record RiskSignalDecisionInput(string? Status, string? Note);
