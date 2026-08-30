using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ListingEnhancementSqliteSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!db.Database.IsSqlite()) return;

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS ListingPriceHistory (
                Id INTEGER NOT NULL CONSTRAINT PK_ListingPriceHistory PRIMARY KEY AUTOINCREMENT,
                ListingId INTEGER NOT NULL,
                PriceGb TEXT NOT NULL,
                Reason TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                CONSTRAINT FK_ListingPriceHistory_Listings_ListingId FOREIGN KEY (ListingId) REFERENCES Listings (Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceHistory_ListingId_CreatedAt ON ListingPriceHistory (ListingId, CreatedAt);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS ListingPriceOffer (
                Id INTEGER NOT NULL CONSTRAINT PK_ListingPriceOffer PRIMARY KEY AUTOINCREMENT,
                ListingId INTEGER NOT NULL,
                BuyerUserId TEXT NOT NULL,
                BuyerName TEXT NOT NULL,
                Quantity INTEGER NOT NULL,
                OfferGbPerUnit TEXT NOT NULL,
                Status TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                ExpiresAt TEXT NOT NULL,
                RespondedAt TEXT NULL,
                PurchasedDealId INTEGER NULL,
                CONSTRAINT FK_ListingPriceOffer_Listings_ListingId FOREIGN KEY (ListingId) REFERENCES Listings (Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffer_ListingId_Status_ExpiresAt ON ListingPriceOffer (ListingId, Status, ExpiresAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffer_BuyerUserId_Status_CreatedAt ON ListingPriceOffer (BuyerUserId, Status, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffer_ListingId_BuyerUserId_Status ON ListingPriceOffer (ListingId, BuyerUserId, Status);");

        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO ListingPriceHistory (ListingId, PriceGb, Reason, CreatedAt)
            SELECT l.Id, l.PriceGb, 'initial', l.CreatedAt
            FROM Listings l
            WHERE NOT EXISTS (SELECT 1 FROM ListingPriceHistory h WHERE h.ListingId = l.Id);
            """);
    }
}
