namespace Kotakas.Web.Models;

public sealed class SaleRequest
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string ItemName { get; set; } = "";
    public string ServerCode { get; set; } = "ZERO";
    public int Quantity { get; set; } = 1;
    public decimal MinimumGb { get; set; }
    public string Note { get; set; } = "";
    public string Status { get; set; } = "open";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Offer> Offers { get; set; } = [];
}

public sealed class Offer
{
    public long Id { get; set; }
    public long SaleRequestId { get; set; }
    public string TraderUserId { get; set; } = "";
    public string TraderName { get; set; } = "";
    public decimal PriceGb { get; set; }
    public int ExpiryMinutes { get; set; } = 10;
    public string Status { get; set; } = "active";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public SaleRequest? SaleRequest { get; set; }
}

public sealed class Deal
{
    public long Id { get; set; }
    public long SaleRequestId { get; set; }
    public long? TraderListingId { get; set; }
    // request_offer: UserId=satıcı kullanıcı, TraderUserId=alıcı pazarcı.
    // trader_listing: UserId=alıcı kullanıcı, TraderUserId=satıcı pazarcı.
    public string Flow { get; set; } = "request_offer";
    public string UserId { get; set; } = "";
    public string TraderUserId { get; set; } = "";
    public string TraderName { get; set; } = "";
    public string ItemName { get; set; } = "";
    public string ServerCode { get; set; } = "ZERO";
    public int Quantity { get; set; } = 1;
    public decimal UnitPriceGb { get; set; }
    public decimal PriceGb { get; set; }
    public decimal GbTryRate { get; set; }
    public decimal GrossTry { get; set; }
    public decimal EscrowTry { get; set; }
    public decimal CommissionPercent { get; set; }
    public decimal CommissionTry { get; set; }
    public decimal SellerNetTry { get; set; }
    public string Status { get; set; } = "funded";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class AppNotification
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TraderApplication
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string StoreName { get; set; } = "";
    public string ServerCode { get; set; } = "ZERO";
    public string Experience { get; set; } = "";
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecidedByUserId { get; set; }
}

public sealed class Wallet
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public decimal BalanceTry { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TraderListing
{
    public long Id { get; set; }
    public string SellerUserId { get; set; } = "";
    public string SellerName { get; set; } = "";
    public string ItemName { get; set; } = "";
    public string ServerCode { get; set; } = "ZERO";
    public decimal PriceGb { get; set; }
    public int Stock { get; set; } = 1;
    public string Status { get; set; } = "active";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WalletLedger
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public decimal AmountTry { get; set; }
    public decimal BeforeTry { get; set; }
    public decimal AfterTry { get; set; }
    public string Type { get; set; } = "admin_adjustment";
    public string Reason { get; set; } = "";
    public string? AdminUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SiteSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SupportTicket
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Message { get; set; } = "";
    public string Status { get; set; } = "open";
    public string Priority { get; set; } = "normal";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DealMessage
{
    public long Id { get; set; }
    public long DealId { get; set; }
    public string SenderUserId { get; set; } = "";
    public string MessageCode { get; set; } = "";
    public string MessageText { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
