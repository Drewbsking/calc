import matplotlib.pyplot as plt

def interpolate_sight_line(eye_elev, obj_elev, total_dist, x_points):
    """
    Returns sight line elevation at each x_point using linear interpolation.
    """
    slope = (obj_elev - eye_elev) / total_dist
    return [eye_elev + slope * x for x in x_points]

def main():
    print("Sight Distance Profile Plotter\n")

    # Input static sight line parameters
    eye_elev = float(input("Enter height of eye (elevation at driveway): "))
    obj_elev = float(input("Enter height of object (elevation in road): "))
    total_dist = float(input("Enter total sight line distance (in feet): "))

    print("\nNow enter known ground points along the sight line.")
    print("Enter distance (ft) and elevation (ft) pairs. Type 'done' to finish.")

    x_vals = []
    y_ground = []

    while True:
        entry = input("Distance,Elevation: ")
        if entry.lower() == 'done':
            break
        try:
            dist, elev = map(float, entry.split(","))
            if dist < 0 or dist > total_dist:
                print(f"⚠️ Distance must be between 0 and {total_dist} ft.")
                continue
            x_vals.append(dist)
            y_ground.append(elev)
        except:
            print("Invalid input. Use format like: 100,993.5")

    # Sort by distance just in case
    x_vals, y_ground = zip(*sorted(zip(x_vals, y_ground)))

    # Generate sight line elevations
    y_sight = interpolate_sight_line(eye_elev, obj_elev, total_dist, x_vals)

    # Plotting
    plt.figure(figsize=(10, 5))
    plt.plot(x_vals, y_sight, label="Sight Line", color='red', linewidth=2)
    plt.plot(x_vals, y_ground, label="Ground Elevation", marker='o')
    plt.fill_between(x_vals, y_ground, y_sight, where=[g > s for g, s in zip(y_ground, y_sight)],
                     color='orange', alpha=0.5, label="Obstruction (if any)")

    plt.xlabel("Distance Along Line (ft)")
    plt.ylabel("Elevation (ft)")
    plt.title("Sight Line vs Ground Elevation")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    main()
