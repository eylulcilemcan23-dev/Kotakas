using Microsoft.AspNetCore.Identity;

namespace Kotakas.Web.Models;

public sealed class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
    public string AccountStatus { get; set; } = "active";
    public bool VerifiedTrader { get; set; }
    public bool UserVerified { get; set; }
    public DateTimeOffset? UserVerifiedAt { get; set; }
    public string? UserVerifiedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
