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
            CREATE TABLE IF NOT EXISTS ListingPriceHistories (
                Id INTEGER NOT NULL CONSTRAINT PK_ListingPriceHistories PRIMARY KEY AUTOINCREMENT,
                ListingId INTEGER NOT NULL,
                PriceGb TEXT NOT NULL,
                Reason TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                CONSTRAINT FK_ListingPriceHistories_Listings_ListingId FOREIGN KEY (ListingId) REFERENCES Listings (Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceHistories_ListingId_CreatedAt ON ListingPriceHistories (ListingId, CreatedAt);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS ListingPriceOffers (
                Id INTEGER NOT NULL CONSTRAINT PK_ListingPriceOffers PRIMARY KEY AUTOINCREMENT,
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
                CONSTRAINT FK_ListingPriceOffers_Listings_ListingId FOREIGN KEY (ListingId) REFERENCES Listings (Id) ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffers_ListingId_Status_ExpiresAt ON ListingPriceOffers (ListingId, Status, ExpiresAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffers_BuyerUserId_Status_CreatedAt ON ListingPriceOffers (BuyerUserId, Status, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ListingPriceOffers_ListingId_BuyerUserId_Status ON ListingPriceOffers (ListingId, BuyerUserId, Status);");

        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO ListingPriceHistories (ListingId, PriceGb, Reason, CreatedAt)
            SELECT l.Id, l.PriceGb, 'initial', l.CreatedAt
            FROM Listings l
            WHERE NOT EXISTS (SELECT 1 FROM ListingPriceHistories h WHERE h.ListingId = l.Id);
            """);
    }
}
