using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class MultiGameSchemaSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (db.Database.IsSqlite()) await EnsureSqlite(db);
        else if (db.Database.IsNpgsql()) await EnsurePostgres(db);
    }

    private static async Task EnsureSqlite(AppDbContext db)
    {
        foreach (var table in new[] { "SaleRequests", "Listings", "Deals" })
        {
            await EnsureSqliteColumn(db, table, "GameCode", "TEXT NOT NULL DEFAULT 'knight-online'");
            await EnsureSqliteColumn(db, table, "ProductType", "TEXT NOT NULL DEFAULT 'item'");
            await EnsureSqliteColumn(db, table, "CurrencyCode", "TEXT NOT NULL DEFAULT 'GB'");
            await db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET GameCode='knight-online' WHERE GameCode IS NULL OR trim(GameCode)='';");
            await db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET ProductType='item' WHERE ProductType IS NULL OR trim(ProductType)='';");
            await db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET CurrencyCode='GB' WHERE CurrencyCode IS NULL OR trim(CurrencyCode)='';");
        }

        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_SaleRequests_GameCode_Status_ServerCode_CreatedAt ON SaleRequests (GameCode, Status, ServerCode, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Listings_GameCode_Status_ServerCode_CreatedAt ON Listings (GameCode, Status, ServerCode, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Deals_GameCode_Status_CreatedAt ON Deals (GameCode, Status, CreatedAt);");
    }

    private static async Task EnsurePostgres(AppDbContext db)
    {
        foreach (var table in new[] { "SaleRequests", "Listings", "Deals" })
        {
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN IF NOT EXISTS \"GameCode\" text NOT NULL DEFAULT 'knight-online';");
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN IF NOT EXISTS \"ProductType\" text NOT NULL DEFAULT 'item';");
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN IF NOT EXISTS \"CurrencyCode\" text NOT NULL DEFAULT 'GB';");
            await db.Database.ExecuteSqlRawAsync($"UPDATE \"{table}\" SET \"GameCode\"='knight-online' WHERE \"GameCode\" IS NULL OR btrim(\"GameCode\")='';");
            await db.Database.ExecuteSqlRawAsync($"UPDATE \"{table}\" SET \"ProductType\"='item' WHERE \"ProductType\" IS NULL OR btrim(\"ProductType\")='';");
            await db.Database.ExecuteSqlRawAsync($"UPDATE \"{table}\" SET \"CurrencyCode\"='GB' WHERE \"CurrencyCode\" IS NULL OR btrim(\"CurrencyCode\")='';");
        }

        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_SaleRequests_GameCode_Status_ServerCode_CreatedAt\" ON \"SaleRequests\" (\"GameCode\", \"Status\", \"ServerCode\", \"CreatedAt\");");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_Listings_GameCode_Status_ServerCode_CreatedAt\" ON \"Listings\" (\"GameCode\", \"Status\", \"ServerCode\", \"CreatedAt\");");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_Deals_GameCode_Status_CreatedAt\" ON \"Deals\" (\"GameCode\", \"Status\", \"CreatedAt\");");
    }

    private static async Task EnsureSqliteColumn(AppDbContext db, string table, string column, string definition)
    {
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        await using var check = conn.CreateCommand();
        check.CommandText = $"PRAGMA table_info({table})";
        await using var reader = await check.ExecuteReaderAsync();
        var exists = false;
        while (await reader.ReadAsync())
        {
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase))
            {
                exists = true;
                break;
            }
        }
        await reader.DisposeAsync();
        if (exists) return;
        await using var alter = conn.CreateCommand();
        alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {definition}";
        await alter.ExecuteNonQueryAsync();
    }
}
