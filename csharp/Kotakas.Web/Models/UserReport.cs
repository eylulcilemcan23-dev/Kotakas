namespace Kotakas.Web.Models;

public sealed class UserReport
{
    public long Id { get; set; }
    public string ReporterUserId { get; set; } = "";
    public string TargetType { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string ReasonCode { get; set; } = "other";
    public string Details { get; set; } = "";
    public string Status { get; set; } = "open";
    public string AdminNote { get; set; } = "";
    public string? ResolvedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
