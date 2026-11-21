<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('season_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('sc_game_id')->unique();
            $table->foreignId('home_season_team_id')->constrained('season_teams');
            $table->foreignId('away_season_team_id')->constrained('season_teams');
            $table->dateTime('start_at');
            $table->unsignedSmallInteger('week')->nullable();
            $table->string('season_type', 16);
            $table->boolean('neutral')->default(false);
            // SportsCrunch's status as sent (scheduled, scheduled-tbd, live, final, postponed, ...).
            $table->string('status', 24);
            $table->unsignedSmallInteger('home_score')->nullable();
            $table->unsignedSmallInteger('away_score')->nullable();
            // Regulation, overtime or shootout; null until the NHL needs it.
            $table->string('end_type', 16)->nullable();
            // The current snapshot's probability for this game (02 §2). Written when a snapshot is
            // published as current, never by the SportsCrunch sync. The foreign key to snapshots is
            // added with that table.
            $table->decimal('p_home', 7, 6)->nullable();
            $table->string('p_source', 16)->nullable();
            $table->char('odds_snapshot_id', 26)->nullable();
            $table->timestamps();

            $table->index(['season_id', 'start_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
