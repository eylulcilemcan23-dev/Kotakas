using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class KotakasStockEndpoints
{
    public static IEndpointRouteBuilder MapKotakasStockEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/kotakas-stock", async (string? server, AppDbContext db) =>
        {
            var rows = await ListInventoryAsync(db, server, publicOnly: true);
            return Results.Ok(new { items = rows.Select(InventoryDto) });
        });

        app.MapGet("/api/kotakas-stock/orders/mine", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var rows = await ListOrdersForUserAsync(db, uid);
            return Results.Ok(new { orders = rows.Select(OrderDto) });
        }).RequireAuthorization();

        app.MapPost("/api/kotakas-stock/{id:long}/order", async (long id, ClaimsPrincipal p, KotakasStockOrderInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var qty = Math.Clamp(input.Quantity, 1, 20);
            await using var tx = await db.Database.BeginTransactionAsync();
            var item = await GetInventoryAsync(db, id);
            if (item is null || item.Status != "active") return Results.NotFound();
            var available = Math.Max(0, item.Stock - item.Reserved);
            if (qty > available) return Results.BadRequest(new { error = "insufficient_stock", available });

            var total = Math.Round(item.SalePriceGb * qty, 2, MidpointRounding.AwayFromZero);
            var orderId = await InsertOrderAsync(db, item.Id, uid, qty, item.SalePriceGb, total);
            await ExecuteAsync(db, "UPDATE \"KotakasInventory\" SET \"Reserved\"=\"Reserved\"+@qty, \"UpdatedAt\"=@now WHERE \"Id\"=@id", ("@qty", qty), ("@now", DateTimeOffset.UtcNow), ("@id", id));
            await tx.CommitAsync();
            return Results.Json(new { ok = true, orderId, totalGb = total, status = "pending_gb" }, statusCode: 201);
        }).RequireAuthorization();

        app.MapGet("/api/admin/kotakas-stock", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            var items = await ListInventoryAsync(db, null, publicOnly: false);
            var orders = await ListAdminOrdersAsync(db);
            var gb = await ListGbStockAsync(db);
            return Results.Ok(new
            {
                items = items.Select(InventoryDto),
                orders = orders.Select(AdminOrderDto),
                gbStock = gb.Select(x => new { x.ServerCode, x.BalanceGb, x.UpdatedAt })
            });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-stock", async (ClaimsPrincipal p, KotakasInventoryCreateInput input, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            var name = (input.ItemName ?? "").Trim();
            var server = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant();
            var image = (input.ImageUrl ?? "").Trim();
            if (name.Length < 2 || input.SalePriceGb <= 0 || input.Stock < 1) return Results.BadRequest(new { error = "invalid_inventory" });
            var id = await InsertInventoryAsync(db, name, server, Math.Max(0, input.BuyPriceGb), input.SalePriceGb, image, input.Stock);
            return Results.Json(new { ok = true, id }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPatch("/api/admin/kotakas-stock/{id:long}", async (long id, ClaimsPrincipal p, KotakasInventoryUpdateInput input, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            var item = await GetInventoryAsync(db, id);
            if (item is null) return Results.NotFound();
            var price = input.SalePriceGb is > 0 ? input.SalePriceGb.Value : item.SalePriceGb;
            var stock = input.Stock is >= 0 ? input.Stock.Value : item.Stock;
            var status = string.IsNullOrWhiteSpace(input.Status) ? item.Status : input.Status!.Trim().ToLowerInvariant();
            if (status is not ("active" or "paused" or "sold_out")) return Results.BadRequest(new { error = "invalid_status" });
            var image = input.ImageUrl is null ? item.ImageUrl : input.ImageUrl.Trim();
            if (stock < item.Reserved) return Results.BadRequest(new { error = "stock_below_reserved", reserved = item.Reserved });
            await ExecuteAsync(db, "UPDATE \"KotakasInventory\" SET \"SalePriceGb\"=@price,\"Stock\"=@stock,\"Status\"=@status,\"ImageUrl\"=@image,\"UpdatedAt\"=@now WHERE \"Id\"=@id",
                ("@price", price), ("@stock", stock), ("@status", status), ("@image", image), ("@now", DateTimeOffset.UtcNow), ("@id", id));
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-stock/orders/{id:long}/gb-received", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending_gb") return Results.BadRequest(new { error = "order_not_pending" });
            var item = await GetInventoryAsync(db, order.InventoryId);
            if (item is null || item.Stock < order.Quantity || item.Reserved < order.Quantity) return Results.BadRequest(new { error = "inventory_state_invalid" });

            var now = DateTimeOffset.UtcNow;
            await ExecuteAsync(db, "UPDATE \"KotakasItemOrders\" SET \"Status\"='gb_received',\"GbReceivedAt\"=@now WHERE \"Id\"=@id", ("@now", now), ("@id", id));
            await UpsertGbStockAsync(db, item.ServerCode, order.TotalGb, now);
            db.Notifications.Add(new AppNotification { UserId = order.BuyerUserId, Title = "GB teslimin onaylandı", Body = $"{item.ItemName} için {order.TotalGb:0.##} GB teslim alındı. Item teslimi hazırlanıyor." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-stock/orders/{id:long}/complete", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "gb_received") return Results.BadRequest(new { error = "gb_not_received" });
            var item = await GetInventoryAsync(db, order.InventoryId);
            if (item is null || item.Stock < order.Quantity || item.Reserved < order.Quantity) return Results.BadRequest(new { error = "inventory_state_invalid" });
            var now = DateTimeOffset.UtcNow;
            await ExecuteAsync(db, "UPDATE \"KotakasInventory\" SET \"Stock\"=\"Stock\"-@qty,\"Reserved\"=\"Reserved\"-@qty,\"Status\"=CASE WHEN (\"Stock\"-@qty)<=0 THEN 'sold_out' ELSE \"Status\" END,\"UpdatedAt\"=@now WHERE \"Id\"=@iid",
                ("@qty", order.Quantity), ("@now", now), ("@iid", order.InventoryId));
            await ExecuteAsync(db, "UPDATE \"KotakasItemOrders\" SET \"Status\"='completed',\"CompletedAt\"=@now WHERE \"Id\"=@id", ("@now", now), ("@id", id));
            db.Notifications.Add(new AppNotification { UserId = order.BuyerUserId, Title = "KOTAKAS item teslimi tamamlandı", Body = $"{item.ItemName} teslim edildi. İşlem tamamlandı." });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapPost("/api/admin/kotakas-stock/orders/{id:long}/cancel", async (long id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!ApiHelpers.IsFullAdmin(p)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            var order = await GetOrderAsync(db, id);
            if (order is null) return Results.NotFound();
            if (order.Status != "pending_gb") return Results.BadRequest(new { error = "only_pending_order_can_cancel" });
            await ExecuteAsync(db, "UPDATE \"KotakasItemOrders\" SET \"Status\"='cancelled' WHERE \"Id\"=@id", ("@id", id));
            await ExecuteAsync(db, "UPDATE \"KotakasInventory\" SET \"Reserved\"=CASE WHEN \"Reserved\">=@qty THEN \"Reserved\"-@qty ELSE 0 END,\"UpdatedAt\"=@now WHERE \"Id\"=@iid",
                ("@qty", order.Quantity), ("@now", DateTimeOffset.UtcNow), ("@iid", order.InventoryId));
            await tx.CommitAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        app.MapKotakasGbSaleEndpoints();
        return app;
    }

    private static object InventoryDto(KotakasInventoryRow x) => new
    {
        x.Id, x.ItemName, x.ServerCode, x.BuyPriceGb, x.SalePriceGb, x.ImageUrl, x.Stock, x.Reserved,
        availableStock = Math.Max(0, x.Stock - x.Reserved), x.Status, x.CreatedAt, x.UpdatedAt,
        profitGb = Math.Round(x.SalePriceGb - x.BuyPriceGb, 2)
    };

    private static object OrderDto(KotakasOrderRow x) => new { x.Id, x.InventoryId, x.ItemName, x.ServerCode, x.Quantity, x.UnitPriceGb, x.TotalGb, x.Status, x.CreatedAt, x.GbReceivedAt, x.CompletedAt };
    private static object AdminOrderDto(KotakasAdminOrderRow x) => new { x.Id, x.InventoryId, x.ItemName, x.ServerCode, x.BuyerUserId, x.BuyerName, x.BuyerEmail, x.Quantity, x.UnitPriceGb, x.TotalGb, x.Status, x.CreatedAt, x.GbReceivedAt, x.CompletedAt };

    private static async Task<List<KotakasInventoryRow>> ListInventoryAsync(AppDbContext db, string? server, bool publicOnly)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            var sql = "SELECT \"Id\",\"ItemName\",\"ServerCode\",\"BuyPriceGb\",\"SalePriceGb\",\"ImageUrl\",\"Stock\",\"Reserved\",\"Status\",\"CreatedAt\",\"UpdatedAt\" FROM \"KotakasInventory\" WHERE 1=1";
            if (publicOnly) sql += " AND \"Status\"='active' AND (\"Stock\"-\"Reserved\")>0";
            if (!string.IsNullOrWhiteSpace(server) && !server.Equals("ALL", StringComparison.OrdinalIgnoreCase)) { sql += " AND \"ServerCode\"=@server"; Add(cmd, "@server", server.Trim().ToUpperInvariant()); }
            cmd.CommandText = sql + " ORDER BY \"Id\" DESC LIMIT 250";
            using var reader = await cmd.ExecuteReaderAsync();
            var rows = new List<KotakasInventoryRow>();
            while (await reader.ReadAsync()) rows.Add(ReadInventory(reader));
            return rows;
        });
    }

    private static async Task<KotakasInventoryRow?> GetInventoryAsync(AppDbContext db, long id)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand(); cmd.CommandText = "SELECT \"Id\",\"ItemName\",\"ServerCode\",\"BuyPriceGb\",\"SalePriceGb\",\"ImageUrl\",\"Stock\",\"Reserved\",\"Status\",\"CreatedAt\",\"UpdatedAt\" FROM \"KotakasInventory\" WHERE \"Id\"=@id LIMIT 1"; Add(cmd, "@id", id);
            using var r = await cmd.ExecuteReaderAsync(); return await r.ReadAsync() ? ReadInventory(r) : null;
        });
    }

    private static async Task<long> InsertInventoryAsync(AppDbContext db, string name, string server, decimal buy, decimal sale, string image, int stock)
    {
        var now = DateTimeOffset.UtcNow;
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = db.Database.IsNpgsql()
                ? "INSERT INTO \"KotakasInventory\" (\"ItemName\",\"ServerCode\",\"BuyPriceGb\",\"SalePriceGb\",\"ImageUrl\",\"Stock\",\"Reserved\",\"Status\",\"CreatedAt\",\"UpdatedAt\") VALUES (@name,@server,@buy,@sale,@image,@stock,0,'active',@now,@now) RETURNING \"Id\""
                : "INSERT INTO \"KotakasInventory\" (\"ItemName\",\"ServerCode\",\"BuyPriceGb\",\"SalePriceGb\",\"ImageUrl\",\"Stock\",\"Reserved\",\"Status\",\"CreatedAt\",\"UpdatedAt\") VALUES (@name,@server,@buy,@sale,@image,@stock,0,'active',@now,@now); SELECT last_insert_rowid();";
            Add(cmd,"@name",name);Add(cmd,"@server",server);Add(cmd,"@buy",buy);Add(cmd,"@sale",sale);Add(cmd,"@image",image);Add(cmd,"@stock",stock);Add(cmd,"@now",now);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        });
    }

    private static async Task<long> InsertOrderAsync(AppDbContext db, long inventoryId, string uid, int qty, decimal unit, decimal total)
    {
        var now = DateTimeOffset.UtcNow;
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = db.Database.IsNpgsql()
                ? "INSERT INTO \"KotakasItemOrders\" (\"InventoryId\",\"BuyerUserId\",\"Quantity\",\"UnitPriceGb\",\"TotalGb\",\"Status\",\"CreatedAt\") VALUES (@iid,@uid,@qty,@unit,@total,'pending_gb',@now) RETURNING \"Id\""
                : "INSERT INTO \"KotakasItemOrders\" (\"InventoryId\",\"BuyerUserId\",\"Quantity\",\"UnitPriceGb\",\"TotalGb\",\"Status\",\"CreatedAt\") VALUES (@iid,@uid,@qty,@unit,@total,'pending_gb',@now); SELECT last_insert_rowid();";
            Add(cmd,"@iid",inventoryId);Add(cmd,"@uid",uid);Add(cmd,"@qty",qty);Add(cmd,"@unit",unit);Add(cmd,"@total",total);Add(cmd,"@now",now);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        });
    }

    private static async Task<List<KotakasOrderRow>> ListOrdersForUserAsync(AppDbContext db, string uid)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd = conn.CreateCommand(); cmd.CommandText = "SELECT o.\"Id\",o.\"InventoryId\",i.\"ItemName\",i.\"ServerCode\",o.\"BuyerUserId\",o.\"Quantity\",o.\"UnitPriceGb\",o.\"TotalGb\",o.\"Status\",o.\"CreatedAt\",o.\"GbReceivedAt\",o.\"CompletedAt\" FROM \"KotakasItemOrders\" o JOIN \"KotakasInventory\" i ON i.\"Id\"=o.\"InventoryId\" WHERE o.\"BuyerUserId\"=@uid ORDER BY o.\"Id\" DESC LIMIT 100"; Add(cmd,"@uid",uid);
            using var r=await cmd.ExecuteReaderAsync();var rows=new List<KotakasOrderRow>();while(await r.ReadAsync())rows.Add(ReadOrder(r));return rows;
        });
    }

    private static async Task<KotakasOrderRow?> GetOrderAsync(AppDbContext db, long id)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd=conn.CreateCommand();cmd.CommandText="SELECT o.\"Id\",o.\"InventoryId\",i.\"ItemName\",i.\"ServerCode\",o.\"BuyerUserId\",o.\"Quantity\",o.\"UnitPriceGb\",o.\"TotalGb\",o.\"Status\",o.\"CreatedAt\",o.\"GbReceivedAt\",o.\"CompletedAt\" FROM \"KotakasItemOrders\" o JOIN \"KotakasInventory\" i ON i.\"Id\"=o.\"InventoryId\" WHERE o.\"Id\"=@id LIMIT 1";Add(cmd,"@id",id);using var r=await cmd.ExecuteReaderAsync();return await r.ReadAsync()?ReadOrder(r):null;
        });
    }

    private static async Task<List<KotakasAdminOrderRow>> ListAdminOrdersAsync(AppDbContext db)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd=conn.CreateCommand();cmd.CommandText="SELECT o.\"Id\",o.\"InventoryId\",i.\"ItemName\",i.\"ServerCode\",o.\"BuyerUserId\",COALESCE(u.\"DisplayName\",''),COALESCE(u.\"Email\",''),o.\"Quantity\",o.\"UnitPriceGb\",o.\"TotalGb\",o.\"Status\",o.\"CreatedAt\",o.\"GbReceivedAt\",o.\"CompletedAt\" FROM \"KotakasItemOrders\" o JOIN \"KotakasInventory\" i ON i.\"Id\"=o.\"InventoryId\" LEFT JOIN \"AspNetUsers\" u ON u.\"Id\"=o.\"BuyerUserId\" ORDER BY CASE WHEN o.\"Status\"='pending_gb' THEN 0 WHEN o.\"Status\"='gb_received' THEN 1 ELSE 2 END,o.\"Id\" DESC LIMIT 250";
            using var r=await cmd.ExecuteReaderAsync();var rows=new List<KotakasAdminOrderRow>();while(await r.ReadAsync())rows.Add(ReadAdminOrder(r));return rows;
        });
    }

    private static async Task<List<KotakasGbStockRow>> ListGbStockAsync(AppDbContext db)
    {
        return await WithConnectionAsync(db, async conn =>
        {
            using var cmd=conn.CreateCommand();cmd.CommandText="SELECT \"ServerCode\",\"BalanceGb\",\"UpdatedAt\" FROM \"KotakasGbStock\" ORDER BY \"ServerCode\"";using var r=await cmd.ExecuteReaderAsync();var rows=new List<KotakasGbStockRow>();while(await r.ReadAsync())rows.Add(new(){ServerCode=Convert.ToString(r.GetValue(0),CultureInfo.InvariantCulture)??"",BalanceGb=Convert.ToDecimal(r.GetValue(1),CultureInfo.InvariantCulture),UpdatedAt=ReadDate(r,2)??DateTimeOffset.UtcNow});return rows;
        });
    }

    private static async Task UpsertGbStockAsync(AppDbContext db, string server, decimal amount, DateTimeOffset now)
    {
        await ExecuteAsync(db, "INSERT INTO \"KotakasGbStock\" (\"ServerCode\",\"BalanceGb\",\"UpdatedAt\") VALUES (@server,@amount,@now) ON CONFLICT(\"ServerCode\") DO UPDATE SET \"BalanceGb\"=\"KotakasGbStock\".\"BalanceGb\"+excluded.\"BalanceGb\",\"UpdatedAt\"=excluded.\"UpdatedAt\"", ("@server",server),("@amount",amount),("@now",now));
    }

    private static async Task<int> ExecuteAsync(AppDbContext db, string sql, params (string Name, object? Value)[] args) => await WithConnectionAsync(db, async conn => { using var cmd=conn.CreateCommand();cmd.CommandText=sql;foreach(var a in args)Add(cmd,a.Name,a.Value);return await cmd.ExecuteNonQueryAsync(); });
    private static async Task<T> WithConnectionAsync<T>(AppDbContext db, Func<DbConnection,Task<T>> action){var conn=db.Database.GetDbConnection();var close=conn.State!=ConnectionState.Open;if(close)await conn.OpenAsync();try{return await action(conn);}finally{if(close)await conn.CloseAsync();}}
    private static void Add(DbCommand cmd,string name,object? value){var p=cmd.CreateParameter();p.ParameterName=name;p.Value=value??DBNull.Value;cmd.Parameters.Add(p);}
    private static DateTimeOffset? ReadDate(DbDataReader r,int i){if(r.IsDBNull(i))return null;var v=r.GetValue(i);if(v is DateTimeOffset dto)return dto;if(v is DateTime dt)return new DateTimeOffset(dt);return DateTimeOffset.TryParse(Convert.ToString(v,CultureInfo.InvariantCulture),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out var parsed)?parsed:null;}
    private static KotakasInventoryRow ReadInventory(DbDataReader r)=>new(){Id=Convert.ToInt64(r.GetValue(0),CultureInfo.InvariantCulture),ItemName=Convert.ToString(r.GetValue(1),CultureInfo.InvariantCulture)??"",ServerCode=Convert.ToString(r.GetValue(2),CultureInfo.InvariantCulture)??"ZERO",BuyPriceGb=Convert.ToDecimal(r.GetValue(3),CultureInfo.InvariantCulture),SalePriceGb=Convert.ToDecimal(r.GetValue(4),CultureInfo.InvariantCulture),ImageUrl=Convert.ToString(r.GetValue(5),CultureInfo.InvariantCulture)??"",Stock=Convert.ToInt32(r.GetValue(6),CultureInfo.InvariantCulture),Reserved=Convert.ToInt32(r.GetValue(7),CultureInfo.InvariantCulture),Status=Convert.ToString(r.GetValue(8),CultureInfo.InvariantCulture)??"active",CreatedAt=ReadDate(r,9)??DateTimeOffset.UtcNow,UpdatedAt=ReadDate(r,10)??DateTimeOffset.UtcNow};
    private static KotakasOrderRow ReadOrder(DbDataReader r)=>new(){Id=Convert.ToInt64(r.GetValue(0),CultureInfo.InvariantCulture),InventoryId=Convert.ToInt64(r.GetValue(1),CultureInfo.InvariantCulture),ItemName=Convert.ToString(r.GetValue(2),CultureInfo.InvariantCulture)??"",ServerCode=Convert.ToString(r.GetValue(3),CultureInfo.InvariantCulture)??"ZERO",BuyerUserId=Convert.ToString(r.GetValue(4),CultureInfo.InvariantCulture)??"",Quantity=Convert.ToInt32(r.GetValue(5),CultureInfo.InvariantCulture),UnitPriceGb=Convert.ToDecimal(r.GetValue(6),CultureInfo.InvariantCulture),TotalGb=Convert.ToDecimal(r.GetValue(7),CultureInfo.InvariantCulture),Status=Convert.ToString(r.GetValue(8),CultureInfo.InvariantCulture)??"",CreatedAt=ReadDate(r,9)??DateTimeOffset.UtcNow,GbReceivedAt=ReadDate(r,10),CompletedAt=ReadDate(r,11)};
    private static KotakasAdminOrderRow ReadAdminOrder(DbDataReader r)=>new(){Id=Convert.ToInt64(r.GetValue(0),CultureInfo.InvariantCulture),InventoryId=Convert.ToInt64(r.GetValue(1),CultureInfo.InvariantCulture),ItemName=Convert.ToString(r.GetValue(2),CultureInfo.InvariantCulture)??"",ServerCode=Convert.ToString(r.GetValue(3),CultureInfo.InvariantCulture)??"ZERO",BuyerUserId=Convert.ToString(r.GetValue(4),CultureInfo.InvariantCulture)??"",BuyerName=Convert.ToString(r.GetValue(5),CultureInfo.InvariantCulture)??"",BuyerEmail=Convert.ToString(r.GetValue(6),CultureInfo.InvariantCulture)??"",Quantity=Convert.ToInt32(r.GetValue(7),CultureInfo.InvariantCulture),UnitPriceGb=Convert.ToDecimal(r.GetValue(8),CultureInfo.InvariantCulture),TotalGb=Convert.ToDecimal(r.GetValue(9),CultureInfo.InvariantCulture),Status=Convert.ToString(r.GetValue(10),CultureInfo.InvariantCulture)??"",CreatedAt=ReadDate(r,11)??DateTimeOffset.UtcNow,GbReceivedAt=ReadDate(r,12),CompletedAt=ReadDate(r,13)};
}

public sealed record KotakasStockOrderInput(int Quantity = 1);
public sealed record KotakasInventoryCreateInput(string? ItemName,string? ServerCode,decimal BuyPriceGb,decimal SalePriceGb,string? ImageUrl,int Stock = 1);
public sealed record KotakasInventoryUpdateInput(decimal? SalePriceGb,int? Stock,string? Status,string? ImageUrl);

public class KotakasInventoryRow{public long Id{get;set;}public string ItemName{get;set;}="";public string ServerCode{get;set;}="ZERO";public decimal BuyPriceGb{get;set;}public decimal SalePriceGb{get;set;}public string ImageUrl{get;set;}="";public int Stock{get;set;}public int Reserved{get;set;}public string Status{get;set;}="active";public DateTimeOffset CreatedAt{get;set;}public DateTimeOffset UpdatedAt{get;set;}}
public class KotakasOrderRow{public long Id{get;set;}public long InventoryId{get;set;}public string ItemName{get;set;}="";public string ServerCode{get;set;}="ZERO";public string BuyerUserId{get;set;}="";public int Quantity{get;set;}public decimal UnitPriceGb{get;set;}public decimal TotalGb{get;set;}public string Status{get;set;}="";public DateTimeOffset CreatedAt{get;set;}public DateTimeOffset? GbReceivedAt{get;set;}public DateTimeOffset? CompletedAt{get;set;}}
public sealed class KotakasAdminOrderRow:KotakasOrderRow{public string BuyerName{get;set;}="";public string BuyerEmail{get;set;}="";}
public sealed class KotakasGbStockRow{public string ServerCode{get;set;}="";public decimal BalanceGb{get;set;}public DateTimeOffset UpdatedAt{get;set;}}
