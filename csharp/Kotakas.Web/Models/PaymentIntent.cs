namespace Kotakas.Web.Models;

public sealed class PaymentIntent
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string Purpose { get; set; } = "paid_listing_credit";
    public decimal AmountTry { get; set; }
    public string Provider { get; set; } = "iyzico";
    public string ConversationId { get; set; } = "";
    public string? ProviderToken { get; set; }
    public string? ProviderPaymentId { get; set; }
    public string Status { get; set; } = "created";
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PaidAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}
