using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class KotakasStockSchemaSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "KotakasInventory" (
                    "Id" BIGSERIAL PRIMARY KEY,
                    "ItemName" TEXT NOT NULL,
                    "ServerCode" TEXT NOT NULL,
                    "BuyPriceGb" NUMERIC(18,2) NOT NULL DEFAULT 0,
                    "SalePriceGb" NUMERIC(18,2) NOT NULL,
                    "ImageUrl" TEXT NOT NULL DEFAULT '',
                    "Stock" INTEGER NOT NULL DEFAULT 1,
                    "Reserved" INTEGER NOT NULL DEFAULT 0,
                    "Status" TEXT NOT NULL DEFAULT 'active',
                    "CreatedAt" TIMESTAMPTZ NOT NULL,
                    "UpdatedAt" TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasItemOrders" (
                    "Id" BIGSERIAL PRIMARY KEY,
                    "InventoryId" BIGINT NOT NULL,
                    "BuyerUserId" TEXT NOT NULL,
                    "Quantity" INTEGER NOT NULL DEFAULT 1,
                    "UnitPriceGb" NUMERIC(18,2) NOT NULL,
                    "TotalGb" NUMERIC(18,2) NOT NULL,
                    "Status" TEXT NOT NULL DEFAULT 'pending_gb',
                    "CreatedAt" TIMESTAMPTZ NOT NULL,
                    "GbReceivedAt" TIMESTAMPTZ NULL,
                    "CompletedAt" TIMESTAMPTZ NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasGbStock" (
                    "ServerCode" TEXT PRIMARY KEY,
                    "BalanceGb" NUMERIC(18,2) NOT NULL DEFAULT 0,
                    "UpdatedAt" TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_KotakasInventory_Server_Status" ON "KotakasInventory" ("ServerCode","Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasItemOrders_Status" ON "KotakasItemOrders" ("Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasItemOrders_Buyer" ON "KotakasItemOrders" ("BuyerUserId");
                """);
        }
        else
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "KotakasInventory" (
                    "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "ItemName" TEXT NOT NULL,
                    "ServerCode" TEXT NOT NULL,
                    "BuyPriceGb" REAL NOT NULL DEFAULT 0,
                    "SalePriceGb" REAL NOT NULL,
                    "ImageUrl" TEXT NOT NULL DEFAULT '',
                    "Stock" INTEGER NOT NULL DEFAULT 1,
                    "Reserved" INTEGER NOT NULL DEFAULT 0,
                    "Status" TEXT NOT NULL DEFAULT 'active',
                    "CreatedAt" TEXT NOT NULL,
                    "UpdatedAt" TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasItemOrders" (
                    "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "InventoryId" INTEGER NOT NULL,
                    "BuyerUserId" TEXT NOT NULL,
                    "Quantity" INTEGER NOT NULL DEFAULT 1,
                    "UnitPriceGb" REAL NOT NULL,
                    "TotalGb" REAL NOT NULL,
                    "Status" TEXT NOT NULL DEFAULT 'pending_gb',
                    "CreatedAt" TEXT NOT NULL,
                    "GbReceivedAt" TEXT NULL,
                    "CompletedAt" TEXT NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasGbStock" (
                    "ServerCode" TEXT PRIMARY KEY,
                    "BalanceGb" REAL NOT NULL DEFAULT 0,
                    "UpdatedAt" TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_KotakasInventory_Server_Status" ON "KotakasInventory" ("ServerCode","Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasItemOrders_Status" ON "KotakasItemOrders" ("Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasItemOrders_Buyer" ON "KotakasItemOrders" ("BuyerUserId");
                """);
        }
    }
}
