namespace Kotakas.Web.Models;

public sealed class IdempotencyRecord
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string Scope { get; set; } = "";
    public string RequestKey { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class UserSession
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string DeviceLabel { get; set; } = "";
    public string UserAgentHash { get; set; } = "";
    public string IpHint { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
}
