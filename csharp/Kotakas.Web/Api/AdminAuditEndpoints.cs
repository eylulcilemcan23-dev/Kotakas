using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AdminAuditEndpoints
{
    public static IEndpointRouteBuilder MapAdminAuditEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/audit")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        group.MapGet("/", async (string? q, string? method, int? limit, AppDbContext db) =>
        {
            var take = Math.Clamp(limit ?? 250, 20, 500);
            var query = db.AdminAuditEvents.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(method) && !method.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Method == method.ToUpper());
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Path.Contains(term) || x.AdminUserId.Contains(term));
            }
            var rows = await query.OrderByDescending(x => x.Id).Take(take).ToListAsync();
            var ids = rows.Select(x => x.AdminUserId).Distinct().ToList();
            var admins = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.Email });
            return Results.Ok(new
            {
                events = rows.Select(x => new
                {
                    x.Id,
                    x.Method,
                    x.Path,
                    x.StatusCode,
                    x.CreatedAt,
                    adminUserId = x.AdminUserId,
                    adminName = admins.TryGetValue(x.AdminUserId, out var u) ? u.DisplayName : "Bilinmeyen Admin",
                    adminEmail = admins.TryGetValue(x.AdminUserId, out var e) ? e.Email : null
                })
            });
        });

        return app;
    }
}
