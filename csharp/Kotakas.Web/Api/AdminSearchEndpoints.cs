using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AdminSearchEndpoints
{
    public static IEndpointRouteBuilder MapAdminSearchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/search")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        group.MapGet("/users", async (string? q, string? role, string? status, AppDbContext db) =>
        {
            var query = db.Users.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var text = q.Trim().ToLower();
                query = query.Where(x => x.DisplayName.ToLower().Contains(text) || (x.Email != null && x.Email.ToLower().Contains(text)));
            }
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                var wantedActive = status.Equals("active", StringComparison.OrdinalIgnoreCase);
                query = query.Where(x => wantedActive ? x.AccountStatus == "active" : x.AccountStatus != "active");
            }
            if (!string.IsNullOrWhiteSpace(role) && !role.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                var roleRow = await db.Roles.AsNoTracking().FirstOrDefaultAsync(x => x.Name == role);
                if (roleRow is null) return Results.Ok(new { users = Array.Empty<object>() });
                var idsForRole = db.UserRoles.AsNoTracking().Where(x => x.RoleId == roleRow.Id).Select(x => x.UserId);
                query = query.Where(x => idsForRole.Contains(x.Id));
            }

            // SQLite DateTimeOffset sıralamasını SQL'e çeviremiyor. Filtreyi DB'de,
            // CreatedAt sıralamasını bellekte yaparak yerel önizleme ile PostgreSQL'i aynı tutuyoruz.
            var users = (await query.Take(500).ToListAsync())
                .OrderByDescending(x => x.CreatedAt)
                .Take(150)
                .ToList();
            var ids = users.Select(x => x.Id).ToList();
            var pairs = await (from ur in db.UserRoles.AsNoTracking()
                               join r in db.Roles.AsNoTracking() on ur.RoleId equals r.Id
                               where ids.Contains(ur.UserId)
                               select new { ur.UserId, Role = r.Name ?? "user" }).ToListAsync();
            var roleMap = pairs.GroupBy(x => x.UserId).ToDictionary(g => g.Key, g => PickRole(g.Select(x => x.Role)));
            return Results.Ok(new
            {
                users = users.Select(x => new
                {
                    id = x.Id,
                    x.DisplayName,
                    x.Email,
                    role = roleMap.TryGetValue(x.Id, out var r) ? r : "user",
                    active = x.AccountStatus == "active",
                    x.VerifiedTrader,
                    x.CreatedAt
                })
            });
        });

        group.MapGet("/listings", async (string? q, string? server, string? status, AppDbContext db) =>
        {
            var query = db.Listings.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var text = q.Trim().ToLower();
                query = query.Where(x => x.ItemName.ToLower().Contains(text) || x.SellerName.ToLower().Contains(text));
            }
            if (!string.IsNullOrWhiteSpace(server) && !server.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.ServerCode == server.ToUpper());
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == status.ToLower());
            return Results.Ok(new { listings = await query.OrderByDescending(x => x.Id).Take(200).ToListAsync() });
        });

        group.MapGet("/requests", async (string? q, string? server, string? status, AppDbContext db) =>
        {
            var query = db.SaleRequests.AsNoTracking().Include(x => x.Offers).AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var text = q.Trim().ToLower();
                query = query.Where(x => x.ItemName.ToLower().Contains(text));
            }
            if (!string.IsNullOrWhiteSpace(server) && !server.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.ServerCode == server.ToUpper());
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == status.ToLower());
            var rows = await query.OrderByDescending(x => x.Id).Take(200).ToListAsync();
            return Results.Ok(new { requests = rows.Select(ApiHelpers.RequestDto) });
        });

        return app;
    }

    private static string PickRole(IEnumerable<string> roles)
    {
        var list = roles.ToList();
        if (list.Contains("admin_owner")) return "admin_owner";
        if (list.Contains("admin_full")) return "admin_full";
        if (list.Contains("admin_limited")) return "admin_limited";
        if (list.Contains("trader")) return "trader";
        return "user";
    }
}
