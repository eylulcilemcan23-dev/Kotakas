namespace Kotakas.Web.Models;

public sealed class VerificationRequest
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string Kind { get; set; } = "account";
    public string Status { get; set; } = "pending";
    public string Note { get; set; } = "";
    public string AdminNote { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecidedByUserId { get; set; }
}
