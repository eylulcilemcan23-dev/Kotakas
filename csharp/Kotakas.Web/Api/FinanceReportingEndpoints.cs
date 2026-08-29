using System.Security.Claims;
using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class FinanceReportingEndpoints
{
    public static IEndpointRouteBuilder MapFinanceReportingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/wallet/history", async (ClaimsPrincipal principal, int? take, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var limit = Math.Clamp(take ?? 50, 1, 200);
            var rows = await db.WalletLedgers.AsNoTracking()
                .Where(x => x.UserId == uid)
                .OrderByDescending(x => x.Id)
                .Take(limit)
                .Select(x => new { x.Id, x.AmountTry, x.BeforeTry, x.AfterTry, x.Type, x.Reason, x.CreatedAt })
                .ToListAsync();
            return Results.Ok(new { entries = rows });
        }).RequireAuthorization();

        var finance = app.MapGroup("/api/admin/finance")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        finance.MapGet("/summary", async (AppDbContext db) =>
        {
            var completed = db.Deals.AsNoTracking().Where(x => x.Status == "completed");
            var activeEscrow = db.Deals.AsNoTracking().Where(x => x.EscrowTry > 0 && x.Status != "completed" && x.Status != "refunded");
            return Results.Ok(new
            {
                completedVolumeTry = await completed.SumAsync(x => (decimal?)x.GrossTry) ?? 0m,
                platformCommissionTry = await completed.SumAsync(x => (decimal?)x.CommissionTry) ?? 0m,
                activeEscrowTry = await activeEscrow.SumAsync(x => (decimal?)x.EscrowTry) ?? 0m,
                userWalletTotalTry = await db.Wallets.AsNoTracking().SumAsync(x => (decimal?)x.BalanceTry) ?? 0m,
                completedDeals = await completed.CountAsync(),
                disputedDeals = await db.Deals.AsNoTracking().CountAsync(x => x.Status == "disputed")
            });
        });

        finance.MapGet("/ledger", async (string? userId, int? take, AppDbContext db) =>
        {
            var limit = Math.Clamp(take ?? 200, 1, 1000);
            var q = db.WalletLedgers.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(userId)) q = q.Where(x => x.UserId == userId);
            var rows = await q.OrderByDescending(x => x.Id).Take(limit).ToListAsync();
            var ids = rows.Select(x => x.UserId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.Email });
            return Results.Ok(new
            {
                entries = rows.Select(x => new
                {
                    x.Id,
                    x.UserId,
                    user = names.TryGetValue(x.UserId, out var n) ? n.DisplayName : "Kullanıcı",
                    email = names.TryGetValue(x.UserId, out var e) ? e.Email : "",
                    x.AmountTry,
                    x.BeforeTry,
                    x.AfterTry,
                    x.Type,
                    x.Reason,
                    x.AdminUserId,
                    x.CreatedAt
                })
            });
        });

        return app;
    }
}
