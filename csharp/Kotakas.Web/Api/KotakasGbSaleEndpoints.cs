using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class KotakasGbSaleEndpoints
{
    public static IEndpointRouteBuilder MapKotakasGbSaleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/kotakas-gb-sales", async (AppDbContext db) =>
        {
            var rows = await ListOffersAsync(db, activeOnly: true);
            return Results.Ok(new { offers = rows.Select(OfferDto) });
        });

        app.MapGet("/api/kotakas-gb-sales/orders/mine", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var rows = await ListUserOrdersAsync(db, uid);
            return Results.Ok(new { orders = rows.Select(OrderDto) });
        }).RequireAuthorization();

        app.MapPost("/api/kotakas-gb-sales/orders", async (ClaimsPrincipal p, KotakasGbSaleOrderInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var server = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant();
            var qty = Math.Round(input.QuantityGb, 2, MidpointRounding.AwayFromZero);
            if (server.Length < 2 || qty < 0.10m || qty > 9999m)
                return Results.BadRequest(new { error = "invalid_gb_order" });

            await using var tx = await db.Database.BeginTransactionAsync();
            var offer = await GetOfferAsync(db, server);
            if (offer is null || !offer.IsActive || offer.SalePriceTry <= 0)
                return Results.BadRequest(new { error = "gb_sale_closed" });

            var available = Math.Max(0m, offer.BalanceGb - offer.ReservedGb);
            if (qty > available)
                return Results.BadRequest(new { error = "insufficient_gb_stock", availableGb = available });

            var reserved = await ExecuteAsync(db,
                "UPDATE \"KotakasGbSaleSettings\" SET \"ReservedGb\"=\"ReservedGb\"+@qty,\"UpdatedAt\"=@now WHERE \"ServerCode\"=@server AND \"IsActive\"=1 AND \"SalePriceTry\">0 AND ((SELECT \"BalanceGb\" FROM \"KotakasGbStock\" WHERE \"ServerCode\"=@server)-\"ReservedGb\")>=@qty",
                ("@qty", qty), ("@now", DateTimeOffset.UtcNow), ("@server", server));
            if (reserved != 1)
                return Results.BadRequest(new { error = "insufficient_gb_stock" });

            var total = Math.Round(qty * offer.SalePriceTry, 2, MidpointRounding.AwayFromZero);
            var id = await InsertOrderAsync(db, uid, server, qty, offer.SalePriceTry, total);
            await tx.CommitAsync();
            return Results.Json(new { ok = true, orderId = id, quantityGb = qty, unitPriceTry = offer.SalePriceTry, totalTry = total, status = "pending_payment" }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPost("/api/kotakas-gb-sales/orders/{id:long}/cancel", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null || order.BuyerUserId != uid) return Results.NotFound();
            if (order.Status != "pending_payment") return Results.BadRequest(new { error = "order_cannot_cancel" });
            await ExecuteAsync(db, "UPDATE \"KotakasGbSaleOrders\" SET \"Status\"='cancelled' WHERE \"Id\"=@id", ("@id", id));
            await ReleaseReservationAsync(db, order.ServerCode, order.QuantityGb);
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapGet("/api/admin/kotakas-gb-sales", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            var offers = await ListOffersAsync(db, activeOnly: false);
            var orders = await ListAdminOrdersAsync(db);
            return Results.Ok(new { offers = offers.Select(OfferDto), orders = orders.Select(AdminOrderDto) });
        }).RequireAuthorization();

        app.MapPatch("/api/admin/kotakas-gb-sales/{server}", async (string server, ClaimsPrincipal p, KotakasGbSaleSettingInput input, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            server = (server ?? "ZERO").Trim().ToUpperInvariant();
            var price = Math.Round(input.SalePriceTry, 2, MidpointRounding.AwayFromZero);
            if (server.Length < 2 || price < 0) return Results.BadRequest(new { error = "invalid_gb_setting" });
            var stock = await GetGbBalanceAsync(db, server);
            if (stock is null) return Results.BadRequest(new { error = "gb_stock_not_found" });
            await UpsertSettingAsync(db, server, price, input.IsActive);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-gb-sales/orders/{id:long}/payment-received", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending_payment") return Results.BadRequest(new { error = "order_not_pending_payment" });
            var now = DateTimeOffset.UtcNow;
            await ExecuteAsync(db, "UPDATE \"KotakasGbSaleOrders\" SET \"Status\"='payment_received',\"PaymentReceivedAt\"=@now WHERE \"Id\"=@id", ("@now", now), ("@id", id));
            db.Notifications.Add(new AppNotification { UserId = order.BuyerUserId, Title = "GB siparişi ödemen onaylandı", Body = $"{order.ServerCode} • {order.QuantityGb:0.##} GB için ödeme alındı. Oyun içi teslimat hazırlanıyor." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-gb-sales/orders/{id:long}/complete", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "payment_received") return Results.BadRequest(new { error = "payment_not_received" });

            var stock = await GetGbBalanceAsync(db, order.ServerCode);
            var offer = await GetOfferAsync(db, order.ServerCode);
            if (stock is null || offer is null || stock.Value < order.QuantityGb || offer.ReservedGb < order.QuantityGb)
                return Results.BadRequest(new { error = "gb_stock_state_invalid" });

            var now = DateTimeOffset.UtcNow;
            var changed = await ExecuteAsync(db, "UPDATE \"KotakasGbStock\" SET \"BalanceGb\"=\"BalanceGb\"-@qty,\"UpdatedAt\"=@now WHERE \"ServerCode\"=@server AND \"BalanceGb\">=@qty",
                ("@qty", order.QuantityGb), ("@now", now), ("@server", order.ServerCode));
            if (changed != 1) return Results.BadRequest(new { error = "insufficient_gb_stock" });
            await ReleaseReservationAsync(db, order.ServerCode, order.QuantityGb);
            await ExecuteAsync(db, "UPDATE \"KotakasGbSaleOrders\" SET \"Status\"='completed',\"CompletedAt\"=@now WHERE \"Id\"=@id", ("@now", now), ("@id", id));
            db.Notifications.Add(new AppNotification { UserId = order.BuyerUserId, Title = "GB teslimin tamamlandı", Body = $"{order.ServerCode} • {order.QuantityGb:0.##} GB oyun içinde teslim edildi. Sipariş tamamlandı." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-gb-sales/orders/{id:long}/cancel", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending_payment") return Results.BadRequest(new { error = "only_unpaid_order_can_cancel" });
            await ExecuteAsync(db, "UPDATE \"KotakasGbSaleOrders\" SET \"Status\"='cancelled' WHERE \"Id\"=@id", ("@id", id));
            await ReleaseReservationAsync(db, order.ServerCode, order.QuantityGb);
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        return app;
    }

    private static object OfferDto(KotakasGbOfferRow x) => new
    {
        x.ServerCode, x.BalanceGb, x.ReservedGb,
        availableGb = Math.Max(0m, x.BalanceGb - x.ReservedGb),
        x.SalePriceTry, x.IsActive, x.UpdatedAt
    };

    private static object OrderDto(KotakasGbSaleOrderRow x) => new { x.Id, x.ServerCode, x.QuantityGb, x.UnitPriceTry, x.TotalTry, x.Status, x.CreatedAt, x.PaymentReceivedAt, x.CompletedAt };
    private static object AdminOrderDto(KotakasGbAdminSaleOrderRow x) => new { x.Id, x.BuyerUserId, x.BuyerName, x.BuyerEmail, x.ServerCode, x.QuantityGb, x.UnitPriceTry, x.TotalTry, x.Status, x.CreatedAt, x.PaymentReceivedAt, x.CompletedAt };

    private static async Task<List<KotakasGbOfferRow>> ListOffersAsync(AppDbContext db, bool activeOnly) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT s.\"ServerCode\",s.\"BalanceGb\",COALESCE(c.\"ReservedGb\",0),COALESCE(c.\"SalePriceTry\",0),COALESCE(c.\"IsActive\",0),COALESCE(c.\"UpdatedAt\",s.\"UpdatedAt\") FROM \"KotakasGbStock\" s LEFT JOIN \"KotakasGbSaleSettings\" c ON c.\"ServerCode\"=s.\"ServerCode\"" + (activeOnly ? " WHERE COALESCE(c.\"IsActive\",0)=1 AND COALESCE(c.\"SalePriceTry\",0)>0 AND (s.\"BalanceGb\"-COALESCE(c.\"ReservedGb\",0))>0" : "") + " ORDER BY s.\"ServerCode\"";
        using var r = await cmd.ExecuteReaderAsync();
        var rows = new List<KotakasGbOfferRow>();
        while (await r.ReadAsync()) rows.Add(ReadOffer(r));
        return rows;
    });

    private static async Task<KotakasGbOfferRow?> GetOfferAsync(AppDbContext db, string server) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT s.\"ServerCode\",s.\"BalanceGb\",COALESCE(c.\"ReservedGb\",0),COALESCE(c.\"SalePriceTry\",0),COALESCE(c.\"IsActive\",0),COALESCE(c.\"UpdatedAt\",s.\"UpdatedAt\") FROM \"KotakasGbStock\" s LEFT JOIN \"KotakasGbSaleSettings\" c ON c.\"ServerCode\"=s.\"ServerCode\" WHERE s.\"ServerCode\"=@server LIMIT 1";
        Add(cmd, "@server", server); using var r = await cmd.ExecuteReaderAsync(); return await r.ReadAsync() ? ReadOffer(r) : null;
    });

    private static async Task<decimal?> GetGbBalanceAsync(AppDbContext db, string server) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd = conn.CreateCommand(); cmd.CommandText = "SELECT \"BalanceGb\" FROM \"KotakasGbStock\" WHERE \"ServerCode\"=@server LIMIT 1"; Add(cmd, "@server", server);
        var v = await cmd.ExecuteScalarAsync(); return v is null or DBNull ? null : Convert.ToDecimal(v, CultureInfo.InvariantCulture);
    });

    private static async Task UpsertSettingAsync(AppDbContext db, string server, decimal price, bool active)
    {
        var now = DateTimeOffset.UtcNow;
        await ExecuteAsync(db, "INSERT INTO \"KotakasGbSaleSettings\" (\"ServerCode\",\"SalePriceTry\",\"ReservedGb\",\"IsActive\",\"UpdatedAt\") VALUES (@server,@price,0,@active,@now) ON CONFLICT(\"ServerCode\") DO UPDATE SET \"SalePriceTry\"=excluded.\"SalePriceTry\",\"IsActive\"=excluded.\"IsActive\",\"UpdatedAt\"=excluded.\"UpdatedAt\"",
            ("@server", server), ("@price", price), ("@active", active ? 1 : 0), ("@now", now));
    }

    private static async Task<long> InsertOrderAsync(AppDbContext db, string uid, string server, decimal qty, decimal unitPrice, decimal total)
    {
        var now = DateTimeOffset.UtcNow;
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = db.Database.IsNpgsql()
                ? "INSERT INTO \"KotakasGbSaleOrders\" (\"BuyerUserId\",\"ServerCode\",\"QuantityGb\",\"UnitPriceTry\",\"TotalTry\",\"Status\",\"CreatedAt\") VALUES (@uid,@server,@qty,@unit,@total,'pending_payment',@now) RETURNING \"Id\""
                : "INSERT INTO \"KotakasGbSaleOrders\" (\"BuyerUserId\",\"ServerCode\",\"QuantityGb\",\"UnitPriceTry\",\"TotalTry\",\"Status\",\"CreatedAt\") VALUES (@uid,@server,@qty,@unit,@total,'pending_payment',@now); SELECT last_insert_rowid();";
            Add(cmd,"@uid",uid); Add(cmd,"@server",server); Add(cmd,"@qty",qty); Add(cmd,"@unit",unitPrice); Add(cmd,"@total",total); Add(cmd,"@now",now);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        });
    }

    private static async Task<List<KotakasGbSaleOrderRow>> ListUserOrdersAsync(AppDbContext db, string uid) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd = conn.CreateCommand(); cmd.CommandText = "SELECT \"Id\",\"BuyerUserId\",\"ServerCode\",\"QuantityGb\",\"UnitPriceTry\",\"TotalTry\",\"Status\",\"CreatedAt\",\"PaymentReceivedAt\",\"CompletedAt\" FROM \"KotakasGbSaleOrders\" WHERE \"BuyerUserId\"=@uid ORDER BY \"Id\" DESC LIMIT 100"; Add(cmd,"@uid",uid);
        using var r=await cmd.ExecuteReaderAsync(); var rows=new List<KotakasGbSaleOrderRow>(); while(await r.ReadAsync()) rows.Add(ReadOrder(r)); return rows;
    });

    private static async Task<KotakasGbSaleOrderRow?> GetOrderAsync(AppDbContext db, long id) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd=conn.CreateCommand(); cmd.CommandText="SELECT \"Id\",\"BuyerUserId\",\"ServerCode\",\"QuantityGb\",\"UnitPriceTry\",\"TotalTry\",\"Status\",\"CreatedAt\",\"PaymentReceivedAt\",\"CompletedAt\" FROM \"KotakasGbSaleOrders\" WHERE \"Id\"=@id LIMIT 1"; Add(cmd,"@id",id);
        using var r=await cmd.ExecuteReaderAsync(); return await r.ReadAsync()?ReadOrder(r):null;
    });

    private static async Task<List<KotakasGbAdminSaleOrderRow>> ListAdminOrdersAsync(AppDbContext db) => await WithConnectionAsync(db, async conn =>
    {
        using var cmd=conn.CreateCommand();
        cmd.CommandText="SELECT o.\"Id\",o.\"BuyerUserId\",COALESCE(u.\"DisplayName\",''),COALESCE(u.\"Email\",''),o.\"ServerCode\",o.\"QuantityGb\",o.\"UnitPriceTry\",o.\"TotalTry\",o.\"Status\",o.\"CreatedAt\",o.\"PaymentReceivedAt\",o.\"CompletedAt\" FROM \"KotakasGbSaleOrders\" o LEFT JOIN \"AspNetUsers\" u ON u.\"Id\"=o.\"BuyerUserId\" ORDER BY CASE WHEN o.\"Status\"='pending_payment' THEN 0 WHEN o.\"Status\"='payment_received' THEN 1 ELSE 2 END,o.\"Id\" DESC LIMIT 250";
        using var r=await cmd.ExecuteReaderAsync(); var rows=new List<KotakasGbAdminSaleOrderRow>();
        while(await r.ReadAsync()) rows.Add(new KotakasGbAdminSaleOrderRow{Id=ToLong(r,0),BuyerUserId=ToStr(r,1),BuyerName=ToStr(r,2),BuyerEmail=ToStr(r,3),ServerCode=ToStr(r,4),QuantityGb=ToDec(r,5),UnitPriceTry=ToDec(r,6),TotalTry=ToDec(r,7),Status=ToStr(r,8),CreatedAt=ReadDate(r,9)??DateTimeOffset.UtcNow,PaymentReceivedAt=ReadDate(r,10),CompletedAt=ReadDate(r,11)});
        return rows;
    });

    private static async Task ReleaseReservationAsync(AppDbContext db, string server, decimal qty) => await ExecuteAsync(db,
        "UPDATE \"KotakasGbSaleSettings\" SET \"ReservedGb\"=CASE WHEN \"ReservedGb\">=@qty THEN \"ReservedGb\"-@qty ELSE 0 END,\"UpdatedAt\"=@now WHERE \"ServerCode\"=@server",
        ("@qty",qty),("@now",DateTimeOffset.UtcNow),("@server",server));

    private static KotakasGbOfferRow ReadOffer(DbDataReader r) => new(){ServerCode=ToStr(r,0),BalanceGb=ToDec(r,1),ReservedGb=ToDec(r,2),SalePriceTry=ToDec(r,3),IsActive=Convert.ToInt32(r.GetValue(4),CultureInfo.InvariantCulture)==1,UpdatedAt=ReadDate(r,5)??DateTimeOffset.UtcNow};
    private static KotakasGbSaleOrderRow ReadOrder(DbDataReader r) => new(){Id=ToLong(r,0),BuyerUserId=ToStr(r,1),ServerCode=ToStr(r,2),QuantityGb=ToDec(r,3),UnitPriceTry=ToDec(r,4),TotalTry=ToDec(r,5),Status=ToStr(r,6),CreatedAt=ReadDate(r,7)??DateTimeOffset.UtcNow,PaymentReceivedAt=ReadDate(r,8),CompletedAt=ReadDate(r,9)};

    private static async Task<int> ExecuteAsync(AppDbContext db,string sql,params (string Name,object? Value)[] args)=>await WithConnectionAsync(db,async conn=>{using var cmd=conn.CreateCommand();cmd.CommandText=sql;foreach(var a in args)Add(cmd,a.Name,a.Value);return await cmd.ExecuteNonQueryAsync();});
    private static async Task<T> WithConnectionAsync<T>(AppDbContext db,Func<DbConnection,Task<T>> action){var conn=db.Database.GetDbConnection();var close=conn.State!=ConnectionState.Open;if(close)await conn.OpenAsync();try{return await action(conn);}finally{if(close)await conn.CloseAsync();}}
    private static void Add(DbCommand cmd,string name,object? value){var p=cmd.CreateParameter();p.ParameterName=name;p.Value=value??DBNull.Value;cmd.Parameters.Add(p);}
    private static string ToStr(DbDataReader r,int i)=>Convert.ToString(r.GetValue(i),CultureInfo.InvariantCulture)??"";
    private static long ToLong(DbDataReader r,int i)=>Convert.ToInt64(r.GetValue(i),CultureInfo.InvariantCulture);
    private static decimal ToDec(DbDataReader r,int i)=>Convert.ToDecimal(r.GetValue(i),CultureInfo.InvariantCulture);
    private static DateTimeOffset? ReadDate(DbDataReader r,int i){if(r.IsDBNull(i))return null;var v=r.GetValue(i);if(v is DateTimeOffset dto)return dto;if(v is DateTime dt)return new DateTimeOffset(dt);return DateTimeOffset.TryParse(Convert.ToString(v,CultureInfo.InvariantCulture),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out var parsed)?parsed:null;}
}

public sealed record KotakasGbSaleOrderInput(string? ServerCode, decimal QuantityGb);
public sealed record KotakasGbSaleSettingInput(decimal SalePriceTry, bool IsActive);
public sealed class KotakasGbOfferRow{public string ServerCode{get;set;}="ZERO";public decimal BalanceGb{get;set;}public decimal ReservedGb{get;set;}public decimal SalePriceTry{get;set;}public bool IsActive{get;set;}public DateTimeOffset UpdatedAt{get;set;}}
public class KotakasGbSaleOrderRow{public long Id{get;set;}public string BuyerUserId{get;set;}="";public string ServerCode{get;set;}="ZERO";public decimal QuantityGb{get;set;}public decimal UnitPriceTry{get;set;}public decimal TotalTry{get;set;}public string Status{get;set;}="";public DateTimeOffset CreatedAt{get;set;}public DateTimeOffset? PaymentReceivedAt{get;set;}public DateTimeOffset? CompletedAt{get;set;}}
public sealed class KotakasGbAdminSaleOrderRow:KotakasGbSaleOrderRow{public string BuyerName{get;set;}="";public string BuyerEmail{get;set;}="";}
