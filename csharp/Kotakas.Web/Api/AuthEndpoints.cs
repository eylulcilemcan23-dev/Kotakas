using System.Security.Claims;
using Kotakas.Web.Models;
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
        app.MapPost("/api/logout", async (SignInManager<ApplicationUser> signIn) => { await signIn.SignOutAsync(); return Results.Ok(new { ok = true }); });
        app.MapGet("/api/me", async (ClaimsPrincipal p, UserManager<ApplicationUser> users) =>
        {
            if (!(p.Identity?.IsAuthenticated ?? false)) return Results.Ok(new { user = (object?)null });
            var user = await users.GetUserAsync(p); return Results.Ok(new { user = user is null ? null : await ApiHelpers.UserDto(users, user) });
        });
        return app;
    }
}
public record RegisterRequest(string? DisplayName, string? Email, string? Password);
public record LoginRequest(string? Email, string? Password);
