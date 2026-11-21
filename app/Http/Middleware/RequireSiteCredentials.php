<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * HTTP basic auth for the whole site before launch (config/site.php). Off when no credentials are
 * set. The SportsCrunch webhook and the health check stay open.
 */
class RequireSiteCredentials
{
    private const OPEN_PATHS = ['webhooks/*', 'up'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = config('site.basic_auth.user');
        $password = config('site.basic_auth.password');
        if (! is_string($user) || $user === '' || ! is_string($password) || $password === '' || $request->is(...self::OPEN_PATHS)) {
            return $next($request);
        }

        if (hash_equals($user, (string) $request->getUser()) && hash_equals($password, (string) $request->getPassword())) {
            return $next($request);
        }

        return response('Authentication required', 401, ['WWW-Authenticate' => 'Basic realm="PlayoffOdds"']);
    }
}
