using System.Security.Claims;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

namespace Kotakas.Web.Api;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/register", async (RegisterRequest input, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            var email = (input.Email ?? "").Trim().ToLowerInvariant(); var name = (input.DisplayName ?? "").Trim();
            if (name.Length < 2 || !email.Contains('@') || (input.Password ?? "").Length < 8) return Results.BadRequest(new { error = "invalid_registration" });
            if (await users.FindByEmailAsync(email) is not null) return Results.Conflict(new { error = "email_already_registered" });
            var user = new ApplicationUser { UserName = email, Email = email, DisplayName = name, EmailConfirmed = true };
            var result = await users.CreateAsync(user, input.Password!);
            if (!result.Succeeded) return Results.BadRequest(new { error = "registration_failed", details = result.Errors.Select(x => x.Description) });
            await users.AddToRoleAsync(user, "user"); await signIn.SignInAsync(user, true);
            return Results.Json(new { ok = true, user = await ApiHelpers.UserDto(users, user) }, statusCode: 201);
        });

        app.MapPost("/api/login", async (LoginRequest input, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            var user = await users.FindByEmailAsync((input.Email ?? "").Trim().ToLowerInvariant());
            if (user is null || user.AccountStatus != "active") return Results.Json(new { error = "invalid_credentials" }, statusCode: 401);
            var result = await signIn.PasswordSignInAsync(user, input.Password ?? "", true, true);
            return result.Succeeded ? Results.Ok(new { ok = true, user = await ApiHelpers.UserDto(users, user) }) : Results.Json(new { error = "invalid_credentials" }, statusCode: 401);
        });

        app.MapGet("/api/auth/providers", (IConfiguration configuration) =>
            Results.Ok(new { google = GoogleConfigured(configuration) }));

        app.MapGet("/auth/google", (IConfiguration configuration) =>
        {
            if (!GoogleConfigured(configuration)) return Results.Redirect("/login.html?oauth=google_not_configured");
            var properties = new AuthenticationProperties { RedirectUri = "/auth/google/callback" };
            return Results.Challenge(properties, new[] { "Google" });
        });

        app.MapGet("/auth/google/callback", async (IConfiguration configuration, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            if (!GoogleConfigured(configuration)) return Results.Redirect("/login.html?oauth=google_not_configured");
            var info = await signIn.GetExternalLoginInfoAsync();
            if (info is null) return Results.Redirect("/login.html?oauth=google_failed");

            var user = await users.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
            var email = info.Principal.FindFirstValue(ClaimTypes.Email)?.Trim().ToLowerInvariant();
            if (user is null && !string.IsNullOrWhiteSpace(email)) user = await users.FindByEmailAsync(email);

            if (user is null)
            {
                if (string.IsNullOrWhiteSpace(email)) return Results.Redirect("/login.html?oauth=google_email_missing");
                var displayName = info.Principal.FindFirstValue(ClaimTypes.Name)?.Trim();
                if (string.IsNullOrWhiteSpace(displayName)) displayName = email.Split('@')[0];
                user = new ApplicationUser { UserName = email, Email = email, DisplayName = displayName, EmailConfirmed = true };
                var created = await users.CreateAsync(user);
                if (!created.Succeeded) return Results.Redirect("/login.html?oauth=google_failed");
                await users.AddToRoleAsync(user, "user");
            }

            if (user.AccountStatus != "active")
            {
                await signIn.SignOutAsync();
                return Results.Redirect("/login.html?oauth=google_suspended");
            }

            var existingLogins = await users.GetLoginsAsync(user);
            if (!existingLogins.Any(x => x.LoginProvider == info.LoginProvider && x.ProviderKey == info.ProviderKey))
            {
                var linked = await users.AddLoginAsync(user, info);
                if (!linked.Succeeded) return Results.Redirect("/login.html?oauth=google_failed");
            }

            if (!user.EmailConfirmed) user.EmailConfirmed = true;
            if (string.IsNullOrWhiteSpace(user.DisplayName))
                user.DisplayName = info.Principal.FindFirstValue(ClaimTypes.Name)?.Trim() ?? user.Email?.Split('@')[0] ?? "KOTAKAS Üyesi";
            await users.UpdateAsync(user);
            await signIn.SignInAsync(user, true);
            return Results.Redirect("/login.html?oauth=success");
        });

        app.MapPost("/api/logout", async (SignInManager<ApplicationUser> signIn) => { await signIn.SignOutAsync(); return Results.Ok(new { ok = true }); });
        app.MapGet("/api/me", async (ClaimsPrincipal p, UserManager<ApplicationUser> users) =>
        {
            if (!(p.Identity?.IsAuthenticated ?? false)) return Results.Ok(new { user = (object?)null });
            var user = await users.GetUserAsync(p); return Results.Ok(new { user = user is null ? null : await ApiHelpers.UserDto(users, user) });
        });
        return app;
    }

    private static bool GoogleConfigured(IConfiguration configuration) =>
        !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]) &&
        !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientSecret"]);
}

public record RegisterRequest(string? DisplayName, string? Email, string? Password);
public record LoginRequest(string? Email, string? Password);
