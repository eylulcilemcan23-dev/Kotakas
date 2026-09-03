using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class KotakasGbSaleSchemaSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "KotakasGbSaleSettings" (
                    "ServerCode" TEXT PRIMARY KEY,
                    "SalePriceTry" NUMERIC(18,2) NOT NULL DEFAULT 0,
                    "ReservedGb" NUMERIC(18,2) NOT NULL DEFAULT 0,
                    "IsActive" INTEGER NOT NULL DEFAULT 0,
                    "UpdatedAt" TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasGbSaleOrders" (
                    "Id" BIGSERIAL PRIMARY KEY,
                    "BuyerUserId" TEXT NOT NULL,
                    "ServerCode" TEXT NOT NULL,
                    "QuantityGb" NUMERIC(18,2) NOT NULL,
                    "UnitPriceTry" NUMERIC(18,2) NOT NULL,
                    "TotalTry" NUMERIC(18,2) NOT NULL,
                    "Status" TEXT NOT NULL DEFAULT 'pending_payment',
                    "CreatedAt" TIMESTAMPTZ NOT NULL,
                    "PaymentReceivedAt" TIMESTAMPTZ NULL,
                    "CompletedAt" TIMESTAMPTZ NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Status" ON "KotakasGbSaleOrders" ("Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Buyer" ON "KotakasGbSaleOrders" ("BuyerUserId");
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Server" ON "KotakasGbSaleOrders" ("ServerCode");
                """);
        }
        else
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "KotakasGbSaleSettings" (
                    "ServerCode" TEXT PRIMARY KEY,
                    "SalePriceTry" REAL NOT NULL DEFAULT 0,
                    "ReservedGb" REAL NOT NULL DEFAULT 0,
                    "IsActive" INTEGER NOT NULL DEFAULT 0,
                    "UpdatedAt" TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS "KotakasGbSaleOrders" (
                    "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "BuyerUserId" TEXT NOT NULL,
                    "ServerCode" TEXT NOT NULL,
                    "QuantityGb" REAL NOT NULL,
                    "UnitPriceTry" REAL NOT NULL,
                    "TotalTry" REAL NOT NULL,
                    "Status" TEXT NOT NULL DEFAULT 'pending_payment',
                    "CreatedAt" TEXT NOT NULL,
                    "PaymentReceivedAt" TEXT NULL,
                    "CompletedAt" TEXT NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Status" ON "KotakasGbSaleOrders" ("Status");
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Buyer" ON "KotakasGbSaleOrders" ("BuyerUserId");
                CREATE INDEX IF NOT EXISTS "IX_KotakasGbSaleOrders_Server" ON "KotakasGbSaleOrders" ("ServerCode");
                """);
        }
    }
}
