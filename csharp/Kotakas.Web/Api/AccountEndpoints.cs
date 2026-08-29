using System.Security.Claims;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;

namespace Kotakas.Web.Api;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var account = app.MapGroup("/api/account").RequireAuthorization();

        account.MapPatch("/profile", async (ClaimsPrincipal principal, ProfileUpdateInput input, UserManager<ApplicationUser> users) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var name = (input.DisplayName ?? "").Trim();
            if (name.Length < 2 || name.Length > 40 || ApiHelpers.HasExternalContact(name))
                return Results.BadRequest(new { error = "invalid_display_name" });
            user.DisplayName = name;
            var result = await users.UpdateAsync(user);
            return result.Succeeded
                ? Results.Ok(new { ok = true, user = await ApiHelpers.UserDto(users, user) })
                : Results.BadRequest(new { error = "profile_update_failed", details = result.Errors.Select(x => x.Description) });
        });

        account.MapPost("/password", async (ClaimsPrincipal principal, PasswordChangeInput input, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var next = input.NewPassword ?? "";
            if (next.Length < 8 || next.Length > 128) return Results.BadRequest(new { error = "invalid_new_password" });

            IdentityResult result;
            if (await users.HasPasswordAsync(user))
            {
                if (string.IsNullOrWhiteSpace(input.CurrentPassword)) return Results.BadRequest(new { error = "current_password_required" });
                result = await users.ChangePasswordAsync(user, input.CurrentPassword, next);
            }
            else
            {
                result = await users.AddPasswordAsync(user, next);
            }

            if (!result.Succeeded)
                return Results.BadRequest(new { error = "password_change_failed", details = result.Errors.Select(x => x.Description) });

            await signIn.RefreshSignInAsync(user);
            return Results.Ok(new { ok = true });
        });

        return app;
    }
}

public record ProfileUpdateInput(string? DisplayName);
public record PasswordChangeInput(string? CurrentPassword, string? NewPassword);
