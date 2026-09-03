using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;

namespace Kotakas.Web.Api;

public static class TraderPackageEndpoints
{
    public static readonly TraderPackageDefinition[] Packages =
    [
        new("starter", "Başlangıç", 0.50m, 10, 30, false, false),
        new("trader", "Pazarcı", 1.00m, 30, 30, false, false),
        new("pro", "Pro", 2.00m, 100, 30, true, false),
        new("elite", "Elite", 3.00m, -1, 30, true, true)
    ];

    public static IEndpointRouteBuilder MapTraderPackageEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trader-packages/catalog", () => Results.Ok(new
        {
            packages = Packages.Select(PackageDto)
        }));

        app.MapGet("/api/trader-packages/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("trader") && !ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var userId = ApiHelpers.UserId(principal);
            var rows = await TraderPackageStore.ListForUserAsync(db, userId);
            var now = DateTimeOffset.UtcNow;
            var active = rows.FirstOrDefault(x => x.Status == "active" && x.ExpiresAt is not null && x.ExpiresAt > now);
            var pending = rows.FirstOrDefault(x => x.Status == "pending");

            return Results.Ok(new
            {
                active = active is null ? null : OrderDto(active),
                pending = pending is null ? null : OrderDto(pending),
                history = rows.Take(20).Select(OrderDto)
            });
        }).RequireAuthorization();

        app.MapPost("/api/trader-packages/orders", async (ClaimsPrincipal principal, TraderPackageOrderInput input, AppDbContext db) =>
        {
            if (!principal.IsInRole("trader") && !ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var userId = ApiHelpers.UserId(principal);
            var code = (input.PackageCode ?? "").Trim().ToLowerInvariant();
            var package = Packages.FirstOrDefault(x => x.Code == code);
            if (package is null) return Results.BadRequest(new { error = "invalid_package" });

            var rows = await TraderPackageStore.ListForUserAsync(db, userId);
            var pending = rows.FirstOrDefault(x => x.Status == "pending");
            if (pending is not null)
                return Results.Json(new { error = "package_order_already_pending", pending = OrderDto(pending) }, statusCode: 409);

            var created = await TraderPackageStore.CreateOrderAsync(db, userId, package);
            db.Notifications.Add(new AppNotification
            {
                UserId = userId,
                Title = "Pazarcı paket talebin oluşturuldu",
                Body = $"{package.Name} paketi • {package.PriceGb:0.##} GB. GB teslimi admin tarafından onaylandığında paket aktifleşecek."
            });
            await db.SaveChangesAsync();

            return Results.Json(new { ok = true, order = OrderDto(created) }, statusCode: 201);
        }).RequireAuthorization();

        app.MapGet("/api/admin/trader-packages/orders", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var rows = await TraderPackageStore.ListAdminAsync(db);
            return Results.Ok(new { orders = rows.Select(AdminOrderDto) });
        }).RequireAuthorization();

        app.MapPost("/api/admin/trader-packages/orders/{id:long}/approve", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var order = await TraderPackageStore.GetByIdAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending") return Results.BadRequest(new { error = "package_order_not_pending" });

            var now = DateTimeOffset.UtcNow;
            var expires = now.AddDays(order.DurationDays);
            await TraderPackageStore.ActivateAsync(db, order, ApiHelpers.UserId(principal), now, expires);

            db.Notifications.Add(new AppNotification
            {
                UserId = order.UserId,
                Title = "Pazarcı paketin aktif edildi",
                Body = $"{PackageName(order.PackageCode)} paketin {order.DurationDays} gün boyunca aktif. İlan hakkını kullanabilirsin."
            });
            await db.SaveChangesAsync();

            var active = await TraderPackageStore.GetByIdAsync(db, id);
            return Results.Ok(new { ok = true, order = active is null ? null : OrderDto(active) });
        }).RequireAuthorization();

        app.MapPost("/api/admin/trader-packages/orders/{id:long}/reject", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(principal)) return Results.Forbid();
            var order = await TraderPackageStore.GetByIdAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending") return Results.BadRequest(new { error = "package_order_not_pending" });

            await TraderPackageStore.SetStatusAsync(db, id, "rejected", ApiHelpers.UserId(principal));
            db.Notifications.Add(new AppNotification
            {
                UserId = order.UserId,
                Title = "Pazarcı paket talebi reddedildi",
                Body = $"{PackageName(order.PackageCode)} paket talebin onaylanmadı. Destek üzerinden bilgi alabilirsin."
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        return app;
    }

    private static object PackageDto(TraderPackageDefinition p) => new
    {
        p.Code,
        p.Name,
        p.PriceGb,
        p.ListingLimit,
        unlimited = p.ListingLimit < 0,
        p.DurationDays,
        p.FeaturedListings,
        p.EliteBadge
    };

    private static object OrderDto(TraderPackageOrderRow row)
    {
        var remaining = row.ListingLimit < 0 ? -1 : Math.Max(0, row.ListingLimit - row.ListingsUsed);
        var daysRemaining = row.ExpiresAt is null ? 0 : Math.Max(0, (int)Math.Ceiling((row.ExpiresAt.Value - DateTimeOffset.UtcNow).TotalDays));
        return new
        {
            row.Id,
            row.UserId,
            row.PackageCode,
            packageName = PackageName(row.PackageCode),
            row.PriceGb,
            row.ListingLimit,
            row.ListingsUsed,
            remainingListings = remaining,
            unlimited = row.ListingLimit < 0,
            row.DurationDays,
            row.Status,
            row.CreatedAt,
            row.ActivatedAt,
            row.ExpiresAt,
            daysRemaining
        };
    }

    private static object AdminOrderDto(TraderPackageAdminRow row) => new
    {
        row.Id,
        row.UserId,
        row.DisplayName,
        row.Email,
        row.PackageCode,
        packageName = PackageName(row.PackageCode),
        row.PriceGb,
        row.ListingLimit,
        row.ListingsUsed,
        row.DurationDays,
        row.Status,
        row.CreatedAt,
        row.ActivatedAt,
        row.ExpiresAt
    };

    private static string PackageName(string code) => Packages.FirstOrDefault(x => x.Code == code)?.Name ?? code;

    public sealed record TraderPackageOrderInput(string? PackageCode);
}

public sealed record TraderPackageDefinition(
    string Code,
    string Name,
    decimal PriceGb,
    int ListingLimit,
    int DurationDays,
    bool FeaturedListings,
    bool EliteBadge);

public sealed class TraderPackageOrderRow
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string PackageCode { get; set; } = "";
    public decimal PriceGb { get; set; }
    public int ListingLimit { get; set; }
    public int ListingsUsed { get; set; }
    public int DurationDays { get; set; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? ApprovedByUserId { get; set; }
}

public sealed class TraderPackageAdminRow : TraderPackageOrderRow
{
    public string DisplayName { get; set; } = "";
    public string Email { get; set; } = "";
}

internal static class TraderPackageStore
{
    public static async Task<List<TraderPackageOrderRow>> ListForUserAsync(AppDbContext db, string userId)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT \"Id\",\"UserId\",\"PackageCode\",\"PriceGb\",\"ListingLimit\",\"ListingsUsed\",\"DurationDays\",\"Status\",\"CreatedAt\",\"ActivatedAt\",\"ExpiresAt\",\"ApprovedAt\",\"ApprovedByUserId\"
                FROM \"TraderPackageOrders\"
                WHERE \"UserId\"=@uid
                ORDER BY \"Id\" DESC
                LIMIT 100
                """;
            Add(cmd, "@uid", userId);
            using var reader = await cmd.ExecuteReaderAsync();
            var rows = new List<TraderPackageOrderRow>();
            while (await reader.ReadAsync()) rows.Add(ReadRow(reader));
            return rows;
        });
    }

    public static async Task<TraderPackageOrderRow?> GetActiveAsync(AppDbContext db, string userId)
    {
        var rows = await ListForUserAsync(db, userId);
        var now = DateTimeOffset.UtcNow;
        return rows.FirstOrDefault(x => x.Status == "active" && x.ExpiresAt is not null && x.ExpiresAt > now);
    }

    public static async Task<TraderPackageOrderRow?> GetByIdAsync(AppDbContext db, long id)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT \"Id\",\"UserId\",\"PackageCode\",\"PriceGb\",\"ListingLimit\",\"ListingsUsed\",\"DurationDays\",\"Status\",\"CreatedAt\",\"ActivatedAt\",\"ExpiresAt\",\"ApprovedAt\",\"ApprovedByUserId\"
                FROM \"TraderPackageOrders\" WHERE \"Id\"=@id LIMIT 1
                """;
            Add(cmd, "@id", id);
            using var reader = await cmd.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadRow(reader) : null;
        });
    }

    public static async Task<List<TraderPackageAdminRow>> ListAdminAsync(AppDbContext db)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT o.\"Id\",o.\"UserId\",o.\"PackageCode\",o.\"PriceGb\",o.\"ListingLimit\",o.\"ListingsUsed\",o.\"DurationDays\",o.\"Status\",o.\"CreatedAt\",o.\"ActivatedAt\",o.\"ExpiresAt\",o.\"ApprovedAt\",o.\"ApprovedByUserId\",
                       COALESCE(u.\"DisplayName\",''), COALESCE(u.\"Email\",'')
                FROM \"TraderPackageOrders\" o
                LEFT JOIN \"AspNetUsers\" u ON u.\"Id\"=o.\"UserId\"
                ORDER BY CASE WHEN o.\"Status\"='pending' THEN 0 ELSE 1 END, o.\"Id\" DESC
                LIMIT 250
                """;
            using var reader = await cmd.ExecuteReaderAsync();
            var rows = new List<TraderPackageAdminRow>();
            while (await reader.ReadAsync())
            {
                var baseRow = ReadRow(reader);
                rows.Add(new TraderPackageAdminRow
                {
                    Id = baseRow.Id,
                    UserId = baseRow.UserId,
                    PackageCode = baseRow.PackageCode,
                    PriceGb = baseRow.PriceGb,
                    ListingLimit = baseRow.ListingLimit,
                    ListingsUsed = baseRow.ListingsUsed,
                    DurationDays = baseRow.DurationDays,
                    Status = baseRow.Status,
                    CreatedAt = baseRow.CreatedAt,
                    ActivatedAt = baseRow.ActivatedAt,
                    ExpiresAt = baseRow.ExpiresAt,
                    ApprovedAt = baseRow.ApprovedAt,
                    ApprovedByUserId = baseRow.ApprovedByUserId,
                    DisplayName = reader.IsDBNull(13) ? "" : reader.GetString(13),
                    Email = reader.IsDBNull(14) ? "" : reader.GetString(14)
                });
            }
            return rows;
        });
    }

    public static async Task<TraderPackageOrderRow> CreateOrderAsync(AppDbContext db, string userId, TraderPackageDefinition package)
    {
        var now = DateTimeOffset.UtcNow;
        await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO \"TraderPackageOrders\"
                (\"UserId\",\"PackageCode\",\"PriceGb\",\"ListingLimit\",\"ListingsUsed\",\"DurationDays\",\"Status\",\"CreatedAt\")
                VALUES (@uid,@code,@price,@limit,0,@days,'pending',@created)
                """;
            Add(cmd, "@uid", userId);
            Add(cmd, "@code", package.Code);
            Add(cmd, "@price", package.PriceGb);
            Add(cmd, "@limit", package.ListingLimit);
            Add(cmd, "@days", package.DurationDays);
            Add(cmd, "@created", now);
            await cmd.ExecuteNonQueryAsync();
            return true;
        });

        return (await ListForUserAsync(db, userId)).First(x => x.Status == "pending");
    }

    public static async Task ActivateAsync(AppDbContext db, TraderPackageOrderRow order, string adminUserId, DateTimeOffset now, DateTimeOffset expires)
    {
        await WithConnectionAsync(db, async conn =>
        {
            using (var replace = conn.CreateCommand())
            {
                replace.CommandText = """
                    UPDATE \"TraderPackageOrders\"
                    SET \"Status\"='replaced'
                    WHERE \"UserId\"=@uid AND \"Status\"='active' AND \"Id\"<>@id
                    """;
                Add(replace, "@uid", order.UserId);
                Add(replace, "@id", order.Id);
                await replace.ExecuteNonQueryAsync();
            }

            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE \"TraderPackageOrders\"
                SET \"Status\"='active', \"ListingsUsed\"=0, \"ActivatedAt\"=@now, \"ExpiresAt\"=@expires,
                    \"ApprovedAt\"=@now, \"ApprovedByUserId\"=@admin
                WHERE \"Id\"=@id AND \"Status\"='pending'
                """;
            Add(cmd, "@now", now);
            Add(cmd, "@expires", expires);
            Add(cmd, "@admin", adminUserId);
            Add(cmd, "@id", order.Id);
            await cmd.ExecuteNonQueryAsync();
            return true;
        });
    }

    public static async Task SetStatusAsync(AppDbContext db, long id, string status, string adminUserId)
    {
        await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE \"TraderPackageOrders\"
                SET \"Status\"=@status, \"ApprovedAt\"=@now, \"ApprovedByUserId\"=@admin
                WHERE \"Id\"=@id
                """;
            Add(cmd, "@status", status);
            Add(cmd, "@now", DateTimeOffset.UtcNow);
            Add(cmd, "@admin", adminUserId);
            Add(cmd, "@id", id);
            await cmd.ExecuteNonQueryAsync();
            return true;
        });
    }

    public static async Task IncrementUsageAsync(AppDbContext db, long id)
    {
        await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE \"TraderPackageOrders\"
                SET \"ListingsUsed\"=\"ListingsUsed\"+1
                WHERE \"Id\"=@id AND \"Status\"='active'
                """;
            Add(cmd, "@id", id);
            await cmd.ExecuteNonQueryAsync();
            return true;
        });
    }

    private static TraderPackageOrderRow ReadRow(DbDataReader reader) => new()
    {
        Id = Convert.ToInt64(reader.GetValue(0), CultureInfo.InvariantCulture),
        UserId = Convert.ToString(reader.GetValue(1), CultureInfo.InvariantCulture) ?? "",
        PackageCode = Convert.ToString(reader.GetValue(2), CultureInfo.InvariantCulture) ?? "",
        PriceGb = Convert.ToDecimal(reader.GetValue(3), CultureInfo.InvariantCulture),
        ListingLimit = Convert.ToInt32(reader.GetValue(4), CultureInfo.InvariantCulture),
        ListingsUsed = Convert.ToInt32(reader.GetValue(5), CultureInfo.InvariantCulture),
        DurationDays = Convert.ToInt32(reader.GetValue(6), CultureInfo.InvariantCulture),
        Status = Convert.ToString(reader.GetValue(7), CultureInfo.InvariantCulture) ?? "pending",
        CreatedAt = ReadDate(reader.GetValue(8)) ?? DateTimeOffset.MinValue,
        ActivatedAt = reader.IsDBNull(9) ? null : ReadDate(reader.GetValue(9)),
        ExpiresAt = reader.IsDBNull(10) ? null : ReadDate(reader.GetValue(10)),
        ApprovedAt = reader.IsDBNull(11) ? null : ReadDate(reader.GetValue(11)),
        ApprovedByUserId = reader.IsDBNull(12) ? null : Convert.ToString(reader.GetValue(12), CultureInfo.InvariantCulture)
    };

    private static DateTimeOffset? ReadDate(object value)
    {
        if (value is DBNull) return null;
        if (value is DateTimeOffset dto) return dto;
        if (value is DateTime dt) return new DateTimeOffset(dt);
        var raw = Convert.ToString(value, CultureInfo.InvariantCulture);
        return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed) ? parsed : null;
    }

    private static void Add(DbCommand cmd, string name, object? value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value ?? DBNull.Value;
        cmd.Parameters.Add(p);
    }

    private static async Task<T> WithConnectionAsync<T>(AppDbContext db, Func<DbConnection, Task<T>> action)
    {
        var conn = db.Database.GetDbConnection();
        var openedHere = conn.State != ConnectionState.Open;
        if (openedHere) await conn.OpenAsync();
        try { return await action(conn); }
        finally { if (openedHere) await conn.CloseAsync(); }
    }
}
