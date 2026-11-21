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
        Schema::create('teams', function (Blueprint $table) {
            $table->id();
            $table->foreignId('league_id')->constrained();
            $table->unsignedBigInteger('sc_team_id');
            $table->string('slug');
            $table->string('name');
            $table->string('location');
            $table->string('short_name');
            $table->string('abbreviation', 8);
            $table->string('primary_color', 7)->nullable();
            $table->string('secondary_color', 7)->nullable();
            $table->timestamps();

            $table->unique(['league_id', 'sc_team_id']);
            $table->unique(['league_id', 'slug']);
            $table->unique(['league_id', 'abbreviation']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('teams');
    }
};
