def interpolate_elevation(eye_elev, obj_elev, total_dist, check_dist):
    """
    Linear interpolation between eye and object.
    Returns elevation at a given distance along the sight line.
    """
    slope = (obj_elev - eye_elev) / total_dist
    return eye_elev + slope * check_dist

def main():
    print("Sight Line Elevation Checker\n")

    # Static inputs
    eye_elevation = float(input("Enter height of eye (elevation at driveway): "))
    object_elevation = float(input("Enter height of object (elevation in road): "))
    total_distance = float(input("Enter total distance between eye and object (in feet): "))

    while True:
        try:
            check_distance = float(input("\nEnter distance along line to check (or type -1 to exit): "))
            if check_distance < 0:
                break
            if check_distance > total_distance:
                print(f"⚠️ Distance exceeds total sight line of {total_distance} ft. Try again.")
                continue

            result = interpolate_elevation(eye_elevation, object_elevation, total_distance, check_distance)
            print(f"Elevation at {check_distance:.1f} ft along sight line: {result:.2f} ft")
        except ValueError:
            print("Invalid input. Please enter a number.")

if __name__ == "__main__":
    main()
