namespace Kotakas.Web.Models;

public sealed class RiskSignal
{
    public long Id { get; set; }
    public string Fingerprint { get; set; } = "";
    public string Code { get; set; } = "";
    public string Severity { get; set; } = "medium";
    public string Status { get; set; } = "open";
    public string? SubjectUserId { get; set; }
    public long? DealId { get; set; }
    public long? WalletLedgerId { get; set; }
    public decimal? AmountTry { get; set; }
    public string Title { get; set; } = "";
    public string Details { get; set; } = "";
    public DateTimeOffset FirstDetectedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastDetectedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? ReviewedByUserId { get; set; }
    public string? ResolutionNote { get; set; }
}
