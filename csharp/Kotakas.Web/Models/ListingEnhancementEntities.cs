namespace Kotakas.Web.Models;

public sealed class ListingPriceHistory
{
    public long Id { get; set; }
    public long ListingId { get; set; }
    public decimal PriceGb { get; set; }
    public string Reason { get; set; } = "update";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ListingPriceOffer
{
    public long Id { get; set; }
    public long ListingId { get; set; }
    public string BuyerUserId { get; set; } = "";
    public string BuyerName { get; set; } = "";
    public int Quantity { get; set; } = 1;
    public decimal OfferGbPerUnit { get; set; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(30);
    public DateTimeOffset? RespondedAt { get; set; }
    public long? PurchasedDealId { get; set; }
}
