using System.Data;
using System.Globalization;
using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ListingQuickContactEndpoints
{
    private static readonly IReadOnlyDictionary<string, string> BuyerQuestions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["ITEM_HAZIR_MI"] = "Item şu an hazır mı?",
        ["HEMEN_TESLIM"] = "Şu an teslim edebilir misiniz?",
        ["TESLIM_SURESI"] = "Tahmini teslim süresi nedir?",
        ["ILAN_GUNCEL_MI"] = "İlan ve stok hâlâ güncel mi?",
        ["FIYAT_TEKLIFI"] = "Fiyat için teklif verebilir miyim?",
        ["COKLU_ALIM"] = "Birden fazla adet alım mümkün mü?"
    };

    private static readonly IReadOnlyDictionary<string, string> SellerAnswers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["EVET_HAZIR"] = "Evet, item hazır.",
        ["HEMEN_TESLIM_EDERIM"] = "Evet, şu an teslim edebilirim.",
        ["5_10_DAKIKA"] = "Yaklaşık 5-10 dakika içinde teslim edebilirim.",
        ["15_30_DAKIKA"] = "Yaklaşık 15-30 dakika içinde teslim edebilirim.",
        ["ILAN_GUNCEL"] = "Evet, ilan ve stok güncel.",
        ["TEKLIF_GONDEREBILIRSIN"] = "Fiyat Teklifi butonundan teklif gönderebilirsiniz.",
        ["FIYAT_SABIT"] = "Şu an ilandaki fiyat geçerlidir.",
        ["COKLU_ALIM_VAR"] = "Evet, stok kadar çoklu alım yapabilirsiniz.",
        ["SUAN_MUSAIT_DEGILIM"] = "Şu an müsait değilim, kısa süre sonra teslim edebilirim."
    };

    public static IEndpointRouteBuilder MapListingQuickContactEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/listings/{id:long}/quick-contact", async (
            long id,
            string? buyerUserId,
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var listing = await db.Listings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Status != "cancelled");
            if (listing is null) return Results.NotFound();

            await EnsureTableAsync(db);
            var isSeller = listing.SellerUserId == uid;
            var targetBuyer = isSeller ? buyerUserId?.Trim() : uid;
            if (string.IsNullOrWhiteSpace(targetBuyer))
            {
                return Results.Ok(new
                {
                    role = "seller",
                    listing = ListingDto(listing),
                    questions = BuyerQuestions,
                    answers = SellerAnswers,
                    messages = Array.Empty<object>()
                });
            }

            if (isSeller && !await ThreadExistsAsync(db, id, targetBuyer)) return Results.NotFound();
            var messages = await ReadMessagesAsync(db, id, targetBuyer, 120);
            return Results.Ok(new
            {
                role = isSeller ? "seller" : "buyer",
                listing = ListingDto(listing),
                questions = BuyerQuestions,
                answers = SellerAnswers,
                messages
            });
        }).RequireAuthorization();

        app.MapGet("/api/listing-quick-contact/mine", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            await EnsureTableAsync(db);
            var rows = await ReadMineAsync(db, uid, 250);
            var ids = rows.Select(x => x.ListingId).Distinct().ToList();
            var listings = await db.Listings.AsNoTracking()
                .Where(x => ids.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => new
                {
                    x.Id,
                    x.ItemName,
                    x.ServerCode,
                    x.PriceGb,
                    x.Stock,
                    x.Status,
                    x.SellerUserId,
                    x.SellerName
                });

            return Results.Ok(new
            {
                messages = rows.Select(x => new
                {
                    x.Id,
                    x.ListingId,
                    x.SellerUserId,
                    x.BuyerUserId,
                    x.BuyerName,
                    x.SenderUserId,
                    x.SenderRole,
                    x.MessageCode,
                    x.MessageText,
                    x.CreatedAt,
                    listing = listings.TryGetValue(x.ListingId, out var listing) ? listing : null
                }),
                questions = BuyerQuestions,
                answers = SellerAnswers
            });
        }).RequireAuthorization();

        app.MapPost("/api/listings/{id:long}/quick-contact", async (
            long id,
            ListingQuickContactInput input,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var listing = await db.Listings.FirstOrDefaultAsync(x => x.Id == id && x.Status != "cancelled");
            if (listing is null) return Results.NotFound();
            await EnsureTableAsync(db);

            var isSeller = listing.SellerUserId == uid;
            string buyerUserId;
            string buyerName;
            string role;
            string code;
            string text;
            string recipientUserId;

            if (!isSeller)
            {
                buyerUserId = uid;
                var buyer = await users.GetUserAsync(principal);
                buyerName = buyer?.DisplayName ?? "Kullanıcı";
                code = (input.Code ?? "").Trim().ToUpperInvariant();
                if (!BuyerQuestions.TryGetValue(code, out text!))
                    return Results.BadRequest(new { error = "quick_question_only" });
                role = "buyer";
                recipientUserId = listing.SellerUserId;
            }
            else
            {
                buyerUserId = (input.BuyerUserId ?? "").Trim();
                if (string.IsNullOrWhiteSpace(buyerUserId) || !await ThreadExistsAsync(db, id, buyerUserId))
                    return Results.BadRequest(new { error = "buyer_thread_required" });
                buyerName = await LatestBuyerNameAsync(db, id, buyerUserId) ?? "Kullanıcı";
                code = (input.Code ?? "").Trim().ToUpperInvariant();
                if (!SellerAnswers.TryGetValue(code, out text!))
                    return Results.BadRequest(new { error = "quick_answer_only" });
                role = "seller";
                recipientUserId = buyerUserId;
            }

            var latest = (await ReadMessagesAsync(db, id, buyerUserId, 1)).FirstOrDefault();
            if (latest is not null && latest.SenderUserId == uid && latest.MessageCode == code &&
                DateTimeOffset.UtcNow - latest.CreatedAt < TimeSpan.FromSeconds(8))
                return Results.Conflict(new { error = "quick_message_too_fast" });

            var row = new QuickMessageRow
            {
                Id = Guid.NewGuid().ToString("N"),
                ListingId = id,
                SellerUserId = listing.SellerUserId,
                BuyerUserId = buyerUserId,
                BuyerName = buyerName,
                SenderUserId = uid,
                SenderRole = role,
                MessageCode = code,
                MessageText = text,
                CreatedAt = DateTimeOffset.UtcNow
            };
            await InsertAsync(db, row);

            db.Notifications.Add(new AppNotification
            {
                UserId = recipientUserId,
                Title = isSeller ? "Pazarcı hızlı yanıt gönderdi" : "İlanına hızlı soru geldi",
                Body = $"{listing.ItemName}: {text}"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, message = row });
        }).RequireAuthorization();

        return app;
    }

    private static object ListingDto(TraderListing x) => new
    {
        x.Id,
        x.SellerUserId,
        x.SellerName,
        x.ItemName,
        x.ServerCode,
        x.PriceGb,
        x.Stock,
        x.Status,
        x.CreatedAt
    };

    private static async Task EnsureTableAsync(AppDbContext db)
    {
        var sql = db.Database.IsNpgsql()
            ? """
              CREATE TABLE IF NOT EXISTS "ListingQuickMessages" (
                  "Id" text PRIMARY KEY,
                  "ListingId" bigint NOT NULL,
                  "SellerUserId" text NOT NULL,
                  "BuyerUserId" text NOT NULL,
                  "BuyerName" text NOT NULL,
                  "SenderUserId" text NOT NULL,
                  "SenderRole" text NOT NULL,
                  "MessageCode" text NOT NULL,
                  "MessageText" text NOT NULL,
                  "CreatedAt" timestamptz NOT NULL
              );
              CREATE INDEX IF NOT EXISTS "IX_ListingQuickMessages_ListingBuyerCreated"
                  ON "ListingQuickMessages" ("ListingId", "BuyerUserId", "CreatedAt");
              CREATE INDEX IF NOT EXISTS "IX_ListingQuickMessages_SellerCreated"
                  ON "ListingQuickMessages" ("SellerUserId", "CreatedAt");
              """
            : """
              CREATE TABLE IF NOT EXISTS "ListingQuickMessages" (
                  "Id" TEXT NOT NULL PRIMARY KEY,
                  "ListingId" INTEGER NOT NULL,
                  "SellerUserId" TEXT NOT NULL,
                  "BuyerUserId" TEXT NOT NULL,
                  "BuyerName" TEXT NOT NULL,
                  "SenderUserId" TEXT NOT NULL,
                  "SenderRole" TEXT NOT NULL,
                  "MessageCode" TEXT NOT NULL,
                  "MessageText" TEXT NOT NULL,
                  "CreatedAt" TEXT NOT NULL
              );
              CREATE INDEX IF NOT EXISTS "IX_ListingQuickMessages_ListingBuyerCreated"
                  ON "ListingQuickMessages" ("ListingId", "BuyerUserId", "CreatedAt");
              CREATE INDEX IF NOT EXISTS "IX_ListingQuickMessages_SellerCreated"
                  ON "ListingQuickMessages" ("SellerUserId", "CreatedAt");
              """;
        await db.Database.ExecuteSqlRawAsync(sql);
    }

    private static async Task<bool> ThreadExistsAsync(AppDbContext db, long listingId, string buyerUserId)
    {
        var connection = db.Database.GetDbConnection();
        var close = connection.State != ConnectionState.Open;
        if (close) await connection.OpenAsync();
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM \"ListingQuickMessages\" WHERE \"ListingId\"=@listingId AND \"BuyerUserId\"=@buyerUserId";
            Add(cmd, "@listingId", listingId);
            Add(cmd, "@buyerUserId", buyerUserId);
            var value = await cmd.ExecuteScalarAsync();
            return Convert.ToInt64(value, CultureInfo.InvariantCulture) > 0;
        }
        finally
        {
            if (close) await connection.CloseAsync();
        }
    }

    private static async Task<string?> LatestBuyerNameAsync(AppDbContext db, long listingId, string buyerUserId)
    {
        var rows = await ReadMessagesAsync(db, listingId, buyerUserId, 1);
        return rows.FirstOrDefault()?.BuyerName;
    }

    private static async Task InsertAsync(AppDbContext db, QuickMessageRow row)
    {
        var connection = db.Database.GetDbConnection();
        var close = connection.State != ConnectionState.Open;
        if (close) await connection.OpenAsync();
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                INSERT INTO "ListingQuickMessages"
                ("Id","ListingId","SellerUserId","BuyerUserId","BuyerName","SenderUserId","SenderRole","MessageCode","MessageText","CreatedAt")
                VALUES (@id,@listingId,@sellerUserId,@buyerUserId,@buyerName,@senderUserId,@senderRole,@messageCode,@messageText,@createdAt)
                """;
            Add(cmd, "@id", row.Id);
            Add(cmd, "@listingId", row.ListingId);
            Add(cmd, "@sellerUserId", row.SellerUserId);
            Add(cmd, "@buyerUserId", row.BuyerUserId);
            Add(cmd, "@buyerName", row.BuyerName);
            Add(cmd, "@senderUserId", row.SenderUserId);
            Add(cmd, "@senderRole", row.SenderRole);
            Add(cmd, "@messageCode", row.MessageCode);
            Add(cmd, "@messageText", row.MessageText);
            Add(cmd, "@createdAt", db.Database.IsNpgsql() ? row.CreatedAt : row.CreatedAt.ToString("O", CultureInfo.InvariantCulture));
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            if (close) await connection.CloseAsync();
        }
    }

    private static async Task<List<QuickMessageRow>> ReadMessagesAsync(AppDbContext db, long listingId, string buyerUserId, int take)
    {
        var connection = db.Database.GetDbConnection();
        var close = connection.State != ConnectionState.Open;
        if (close) await connection.OpenAsync();
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = $"""
                SELECT "Id","ListingId","SellerUserId","BuyerUserId","BuyerName","SenderUserId","SenderRole","MessageCode","MessageText","CreatedAt"
                FROM "ListingQuickMessages"
                WHERE "ListingId"=@listingId AND "BuyerUserId"=@buyerUserId
                ORDER BY "CreatedAt" DESC
                LIMIT {Math.Clamp(take, 1, 250)}
                """;
            Add(cmd, "@listingId", listingId);
            Add(cmd, "@buyerUserId", buyerUserId);
            var rows = await ReadRows(cmd);
            rows.Reverse();
            return rows;
        }
        finally
        {
            if (close) await connection.CloseAsync();
        }
    }

    private static async Task<List<QuickMessageRow>> ReadMineAsync(AppDbContext db, string uid, int take)
    {
        var connection = db.Database.GetDbConnection();
        var close = connection.State != ConnectionState.Open;
        if (close) await connection.OpenAsync();
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = $"""
                SELECT "Id","ListingId","SellerUserId","BuyerUserId","BuyerName","SenderUserId","SenderRole","MessageCode","MessageText","CreatedAt"
                FROM "ListingQuickMessages"
                WHERE "SellerUserId"=@uid OR "BuyerUserId"=@uid
                ORDER BY "CreatedAt" DESC
                LIMIT {Math.Clamp(take, 1, 500)}
                """;
            Add(cmd, "@uid", uid);
            return await ReadRows(cmd);
        }
        finally
        {
            if (close) await connection.CloseAsync();
        }
    }

    private static async Task<List<QuickMessageRow>> ReadRows(System.Data.Common.DbCommand cmd)
    {
        var rows = new List<QuickMessageRow>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new QuickMessageRow
            {
                Id = reader.GetString(0),
                ListingId = Convert.ToInt64(reader.GetValue(1), CultureInfo.InvariantCulture),
                SellerUserId = reader.GetString(2),
                BuyerUserId = reader.GetString(3),
                BuyerName = reader.GetString(4),
                SenderUserId = reader.GetString(5),
                SenderRole = reader.GetString(6),
                MessageCode = reader.GetString(7),
                MessageText = reader.GetString(8),
                CreatedAt = ParseDate(reader.GetValue(9))
            });
        }
        return rows;
    }

    private static DateTimeOffset ParseDate(object value)
    {
        if (value is DateTimeOffset dto) return dto;
        if (value is DateTime dt) return new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc));
        return DateTimeOffset.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow;
    }

    private static void Add(System.Data.Common.DbCommand cmd, string name, object value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
    }

    public sealed record ListingQuickContactInput(string? Code, string? BuyerUserId);

    public sealed class QuickMessageRow
    {
        public string Id { get; set; } = "";
        public long ListingId { get; set; }
        public string SellerUserId { get; set; } = "";
        public string BuyerUserId { get; set; } = "";
        public string BuyerName { get; set; } = "";
        public string SenderUserId { get; set; } = "";
        public string SenderRole { get; set; } = "";
        public string MessageCode { get; set; } = "";
        public string MessageText { get; set; } = "";
        public DateTimeOffset CreatedAt { get; set; }
    }
}
